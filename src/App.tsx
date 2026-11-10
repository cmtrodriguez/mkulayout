// MKule News shell. The sidebar, card and chat language is MKuLayout's own so the two
// section desks read as one product; what differs is the gate — Supabase's Google provider
// instead of the layout app's own project — and the fact that nothing here touches the
// layout database.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, Columns3, CheckCircle2, FileText, Lightbulb, LogOut, Menu, Moon, MessageSquare,
  Settings as SettingsIcon, Sun, Users, X,
} from "lucide-react";
import mkuleImg from "./mkule.png";
import { Account, ArtxTask, isRegisteredEmail } from "./types";
import { NewsState, accountByEmail, connectCloud, mutate, push, setActor, useNews, useSync } from "./lib/store";
import { ActionKey, applyAction, isEditorial } from "./lib/workflow";
import { useDeskSession } from "./lib/auth";
import { CLOUD_ENABLED } from "./lib/supabase";
import Login from "./components/Login";
import HomeDesk from "./components/HomeDesk";
import PitchDesk from "./components/PitchDesk";
import ShortformDesk from "./components/ShortformDesk";
import PeopleDesk from "./components/PeopleDesk";
import AssessmentsDesk from "./components/AssessmentsDesk";
import SettingsDesk from "./components/SettingsDesk";
import TaskModal from "./components/TaskModal";
import { ArticlesDesk, ArchiveDesk, PipelineDesk, ReleasesDesk } from "./components/ArticlesDesk";

const DARK_KEY = "mkule-news:dark";
const TAB_KEY = "mkule-news:tab";

interface DeskTab {
  id: string;
  label: string;
  icon: typeof Bell;
  group: "desk" | "section";
  badge?: number;
  show: (viewer: Account) => boolean;
}

const EVERYONE = () => true;
const LEADS_ONLY = (v: Account) => isEditorial(v.role);

export default function App() {
  const state = useNews();
  const sync = useSync();
  const session = useDeskSession();
  const [blockedEmail, setBlockedEmail] = useState("");
  const [dark, setDark] = useState(() => localStorage.getItem(DARK_KEY) === "1");
  const [tab, setTab] = useState(localStorage.getItem(TAB_KEY) || "home");
  const [mobileNav, setMobileNav] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  // The registered list, not the roster, decides who gets in: a Google account outside it
  // never resolves to a viewer, so the desk stays closed whatever the session says.
  const viewer = useMemo(
    () => (isRegisteredEmail(session.email) ? accountByEmail(state, session.email) : undefined),
    [state.accounts, session.email]
  );

  // The shared board is only readable once a session exists: row-level security answers
  // differently to an anonymous tab, so connecting early would cache the wrong document.
  useEffect(() => {
    if (!CLOUD_ENABLED || !session.email) return;
    setActor(session.email);
    void connectCloud();
  }, [session.email]);

  useEffect(() => {
    setBlockedEmail(session.email && !viewer ? session.email : "");
  }, [session.email, viewer]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem(DARK_KEY, dark ? "1" : "0");
  }, [dark]);

  useEffect(() => {
    localStorage.setItem(TAB_KEY, tab);
    setMobileNav(false);
  }, [tab]);

  const signOut = () => { void session.signOut(); setBlockedEmail(""); };

  if (!viewer) {
    return (
      <Login
        accounts={state.accounts}
        blockedEmail={blockedEmail}
        session={session}
        onPick={session.pickLocal}
      />
    );
  }

  const openTasks = state.tasks.filter((t) => !t.archived && t.stage !== "shelved" && t.stage !== "published");
  const myOpen = openTasks.filter((t) => t.writerEmail.toLowerCase() === viewer.email.toLowerCase());
  const waitingOnMe = openTasks.filter((t) => {
    if (isEditorial(viewer.role)) return t.stage === "se" || t.stage === "ae" || t.stage === "eic" || t.stage === "outline-approval" || t.stage === "layout";
    return t.writerEmail.toLowerCase() === viewer.email.toLowerCase() && t.custody === "writer";
  });
  const openPitches = state.pitches.filter((p) => p.status === "open").length;
  const pendingShortform = state.shortform.filter((s) => s.syncStatus === "pending").length;

  const tabs: DeskTab[] = [
    { id: "home", label: "Desk home", icon: MessageSquare, group: "desk", badge: waitingOnMe.length, show: EVERYONE },
    { id: "articles", label: "My articles", icon: FileText, group: "desk", badge: myOpen.length, show: EVERYONE },
    { id: "pipeline", label: "Pipeline", icon: Columns3, group: "desk", badge: isEditorial(viewer.role) ? openTasks.length : undefined, show: LEADS_ONLY },
    { id: "pitches", label: "Pitch bank", icon: Lightbulb, group: "desk", badge: openPitches, show: EVERYONE },
    { id: "shortform", label: "Shortform", icon: CheckCircle2, group: "desk", badge: viewer.role === "News Editor" ? pendingShortform : undefined, show: (v) => v.role === "News Editor" },
    { id: "releases", label: "Releases", icon: CheckCircle2, group: "desk", show: EVERYONE },
    { id: "archive", label: "Archive", icon: FileText, group: "desk", show: EVERYONE },
    { id: "team", label: "Section team", icon: Users, group: "section", show: EVERYONE },
    { id: "assessments", label: "Assessment", icon: Users, group: "section", show: EVERYONE },
    { id: "settings", label: "Settings", icon: SettingsIcon, group: "section", show: LEADS_ONLY },
  ];
  const visibleTabs = tabs.filter((t) => t.show(viewer));
  const active = visibleTabs.some((t) => t.id === tab) ? tab : "home";
  const openTask: ArtxTask | null = openTaskId ? state.tasks.find((t) => t.id === openTaskId) || null : null;

  const act = (task: ArtxTask, key: ActionKey, note?: string) => applyAction(task, viewer, key, note);

  const desk = (() => {
    switch (active) {
      case "articles": return <ArticlesDesk viewer={viewer} state={state} onOpen={(t) => setOpenTaskId(t.id)} />;
      case "pipeline": return <PipelineDesk state={state} onOpen={(t) => setOpenTaskId(t.id)} />;
      case "pitches": return <PitchDesk viewer={viewer} state={state} onOpenTask={(id) => setOpenTaskId(id)} />;
      case "shortform": return <ShortformDesk viewer={viewer} state={state} />;
      case "releases": return <ReleasesDesk viewer={viewer} state={state} onOpen={(t) => setOpenTaskId(t.id)} />;
      case "archive": return <ArchiveDesk viewer={viewer} state={state} onOpen={(t) => setOpenTaskId(t.id)} />;
      case "team": return <PeopleDesk viewer={viewer} state={state} />;
      case "assessments": return <AssessmentsDesk viewer={viewer} state={state} />;
      case "settings": return <SettingsDesk viewer={viewer} state={state} />;
      default: return <HomeDesk viewer={viewer} state={state} />;
    }
  })();

  const navBody = (onNavigate?: () => void) => (
    <div className="flex-1 overflow-y-auto pr-1 space-y-1">
      {(["desk", "section"] as const).map((group) => {
        const list = visibleTabs.filter((t) => t.group === group);
        if (list.length === 0) return null;
        return (
          <div key={group}>
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest px-3 block mb-2 mt-1">
              {group === "desk" ? "Workspace Desk" : "Section Matters"}
            </span>
            {list.map((t) => {
              const Icon = t.icon;
              const isActive = active === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); onNavigate?.(); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[11px] sm:text-xs transition-all cursor-pointer mb-1 ${
                    isActive
                      ? "bg-gradient-to-r from-brand-maroon to-brand-maroon-dark text-white font-black shadow-lg shadow-red-950/40 border-l-4 border-white"
                      : "text-neutral-300 hover:bg-neutral-900 font-semibold border-l-4 border-transparent"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate flex-1 text-left">{t.label}</span>
                  {!!t.badge && (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${isActive ? "bg-white text-brand-maroon" : "bg-neutral-800 text-neutral-300"}`}>
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  const Identity = (
    <div className="pt-4 border-t border-neutral-900 flex items-center gap-2.5 text-left shrink-0">
      <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-maroon to-brand-maroon-dark border border-red-500/20 flex items-center justify-center text-xs font-bold text-white uppercase shrink-0">
        {viewer.name.charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-white truncate">{viewer.name}</p>
        <p className="text-[10px] text-neutral-400 truncate">{viewer.role}</p>
      </div>
      <button
        onClick={signOut}
        className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800 shrink-0 cursor-pointer"
        title="Log out of session"
      >
        <LogOut className="w-3 h-3 inline mr-1" /> Logout
      </button>
    </div>
  );

  const SyncStatus = (
    <div className="pt-3 shrink-0 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5">
      {!CLOUD_ENABLED ? (
        <span className="text-amber-400">Saved in this browser only</span>
      ) : sync.mode === "error" ? (
        <>
          <span className="text-rose-400">Not saved — {sync.error}</span>
          <button onClick={() => void push()} className="text-neutral-300 hover:text-white underline cursor-pointer">Retry</button>
        </>
      ) : (
        <span className={sync.mode === "saved" ? "text-emerald-400" : "text-neutral-400"}>
          {sync.mode === "loading" && "Loading the shared board…"}
          {sync.mode === "saving" && "Saving…"}
          {sync.mode === "saved" && "Shared board up to date"}
        </span>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#faf9f6] dark:bg-neutral-950 grid-lines-bg flex flex-col md:flex-row">
      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="w-72 shrink-0 bg-neutral-950 text-white rounded-[28px] p-6 m-4 hidden md:flex flex-col flex-wrap h-[calc(100vh-2rem)] sticky top-4">
        <div className="flex items-center gap-3.5 pb-5 border-b border-neutral-900">
          <img src={mkuleImg} alt="MKule Logo" className="w-14 h-14 object-contain shrink-0 rounded-2xl p-1 bg-neutral-900 border border-neutral-800 shadow-md" />
          <div className="text-left min-w-0 flex flex-col justify-center">
            <h1 className="font-sans font-black text-lg tracking-tight text-white leading-tight">MKule News</h1>
            <p className="text-[10px] text-neutral-400 font-sans">News section task organizer</p>
          </div>
        </div>
        {navBody()}
        {SyncStatus}
        {Identity}
      </aside>

      {/* --- MOBILE HEADER --- */}
      <header className="md:hidden flex justify-between items-center px-4 py-3 bg-neutral-950 text-white sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => setMobileNav(!mobileNav)} className="p-1.5 hover:bg-neutral-900 rounded-lg text-white cursor-pointer" aria-label="Toggle mobile menu">
            <Menu className="w-5 h-5" />
          </button>
          <img src={mkuleImg} alt="MKule Logo" className="w-7 h-7 object-contain shrink-0" />
          <span className="font-sans font-black text-sm tracking-tight truncate">MKule News</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <BellBox viewer={viewer} state={state} onOpenTask={(id) => setOpenTaskId(id)} />
          <button onClick={() => setDark(!dark)} className="p-1.5 hover:bg-neutral-900 rounded-lg cursor-pointer" aria-label="Toggle dark mode">
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {mobileNav && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/70 flex" onClick={() => setMobileNav(false)}>
          <div className="w-72 max-w-[85%] h-full bg-neutral-950 text-white p-5 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-4 border-b border-neutral-900">
              <span className="font-black text-sm">MKule News</span>
              <button onClick={() => setMobileNav(false)} className="p-1.5 hover:bg-neutral-900 rounded-lg cursor-pointer" aria-label="Close menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pt-4">{navBody(() => setMobileNav(false))}</div>
            {SyncStatus}
            {Identity}
          </div>
        </div>
      )}

      {/* --- MAIN COLUMN --- */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="hidden md:flex items-center justify-end gap-2 px-6 pt-6">
          <BellBox viewer={viewer} state={state} onOpenTask={(id) => setOpenTaskId(id)} />
          <button
            onClick={() => setDark(!dark)}
            className="p-2 rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-300 cursor-pointer"
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
        <main className="flex-1 p-4 sm:p-6 md:pt-2 pb-10">{desk}</main>
      </div>

      {openTask && (
        <TaskModal task={openTask} viewer={viewer} state={state} onClose={() => setOpenTaskId(null)} onAct={act} />
      )}
    </div>
  );
}

/** Notification bell. Unread = targeted at this member and not yet in `readBy`; opening
    the panel marks them read, the way the layout desk's bell does. */
function BellBox({ viewer, state, onOpenTask }: {
  viewer: Account;
  state: NewsState;
  onOpenTask: (taskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  const mine = state.notifications.filter((n) =>
    n.targetEmails.some((e) => e.toLowerCase() === viewer.email.toLowerCase())
  );
  const unread = mine.filter((n) => !n.readBy.includes(viewer.email));

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const markAllRead = () => {
    mutate((draft) => {
      draft.notifications = draft.notifications.map((n) =>
        n.targetEmails.some((e) => e.toLowerCase() === viewer.email.toLowerCase()) && !n.readBy.includes(viewer.email)
          ? { ...n, readBy: [...n.readBy, viewer.email] }
          : n
      );
    });
  };

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => { setOpen(!open); if (!open) markAllRead(); }}
        className="relative p-2 md:rounded-xl md:bg-white md:dark:bg-neutral-900 md:border md:border-gray-200 md:dark:border-neutral-800 rounded-lg text-gray-600 dark:text-neutral-300 cursor-pointer"
        aria-label={`Notifications (${unread.length} unread)`}
      >
        <Bell className="w-4 h-4" />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-brand-maroon text-white text-[9px] font-black flex items-center justify-center">
            {unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(92vw,360px)] max-h-[70vh] overflow-y-auto rounded-2xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-xl z-50">
          <div className="px-3.5 py-2.5 border-b border-gray-100 dark:border-neutral-800 flex items-center justify-between gap-2 sticky top-0 bg-white dark:bg-neutral-900">
            <span className="text-[11px] font-black uppercase tracking-wide text-gray-700 dark:text-neutral-200">Notifications</span>
            <span className="text-[10px] text-gray-400 dark:text-neutral-500">{mine.length} total</span>
          </div>
          {mine.length === 0 ? (
            <p className="text-[11px] text-gray-400 dark:text-neutral-500 italic p-4 text-center">Nothing addressed to you yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
              {mine.slice(0, 40).map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => { if (n.taskId) onOpenTask(n.taskId); setOpen(false); }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                  >
                    <span className="block text-[11px] font-bold text-gray-900 dark:text-neutral-100">{n.title}</span>
                    <span className="block text-[10px] text-gray-500 dark:text-neutral-400 mt-0.5">{n.message}</span>
                    <span className="block text-[9px] text-gray-400 dark:text-neutral-500 mt-1 uppercase font-semibold">
                      {n.type} · {new Date(n.timestamp).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
