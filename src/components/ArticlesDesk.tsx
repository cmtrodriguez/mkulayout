// Article desks: the member's own cards, the section-wide pipeline the editors oversee,
// the archive a News Editor reads per member, and the releases list a published article
// lands on.
import { useState } from "react";
import { Plus } from "lucide-react";
import { Account, ArtxTask, stageLabel } from "../types";
import { NewsState, getState, mutate, nameOf, newId, pushNotification } from "../lib/store";
import { ActionKey, PIPELINE_COLUMNS, addStandaloneArticle, applyAction, canViewTask, isEditorial, isWriterRole, taskAgeLabel } from "../lib/workflow";
import { Button, Desk, Empty, Modal, Panel, Pill } from "./ui";
import TaskCard from "./TaskCard";

export function ArticlesDesk({ viewer, state, onOpen }: {
  viewer: Account;
  state: NewsState;
  onOpen: (task: ArtxTask) => void;
}) {
  const [creating, setCreating] = useState(false);
  const isLead = isEditorial(viewer.role);
  const visible = state.tasks.filter((t) => canViewTask(state, viewer, t) && !t.archived && t.stage !== "shelved");
  const mine = visible.filter((t) => t.writerEmail.toLowerCase() === viewer.email.toLowerCase());
  const awaitingMe = visible.filter((t) => t.writerEmail.toLowerCase() !== viewer.email.toLowerCase());

  const act = (task: ArtxTask, key: ActionKey, note?: string) => applyAction(task, viewer, key, note);

  return (
    <Desk
      title={isLead ? "Articles in progress" : "My articles"}
      note={isLead ? "Everything the section is moving right now, newest first." : "Cards where you are the writer, plus anything handed back to you."}
      actions={isLead ? <Button onClick={() => setCreating(true)}><Plus className="w-3.5 h-3.5" /> New article</Button> : undefined}
    >
      {isLead && awaitingMe.length > 0 && (
        <Panel title="On your desk or your leads' desks">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {awaitingMe.map((t) => <TaskCard key={t.id} task={t} viewer={viewer} state={state} onOpen={onOpen} onAct={act} />)}
          </div>
        </Panel>
      )}

      <Panel title={isLead ? "You also write" : "Yours"}>
        {mine.length === 0 ? <Empty text="No articles assigned to you yet. Grab one from the pitch bank." /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {mine.map((t) => <TaskCard key={t.id} task={t} viewer={viewer} state={state} onOpen={onOpen} onAct={act} />)}
          </div>
        )}
      </Panel>

      {creating && <NewArticleModal viewer={viewer} state={state} onClose={() => setCreating(false)} onOpen={onOpen} />}
    </Desk>
  );
}

function NewArticleModal({ viewer, state, onClose, onOpen }: {
  viewer: Account; state: NewsState; onClose: () => void; onOpen: (t: ArtxTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"news-article" | "news-feat">("news-article");
  const [writerEmail, setWriterEmail] = useState(state.accounts.find((a) => a.role === "News Staffer")?.email || viewer.email);
  const [artxLink, setArtxLink] = useState("");
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [sameDay, setSameDay] = useState(false);

  const create = () => {
    const writer = state.accounts.find((a) => a.email === writerEmail);
    const task = { id: "" };
    mutate((draft) => {
      const created = addStandaloneArticle(draft, {
        title, kind, writerEmail, writerName: writer?.name || nameOf(draft, writerEmail),
        artxLink, releaseDate, sameDay, actorName: viewer.name, actorEmail: viewer.email, actorRole: viewer.role,
      });
      task.id = created.id;
      pushNotification(draft, {
        title: `Article assigned — ${created.title}`, message: `${viewer.name} opened this article and put it on you.`,
        type: "assignment", targetEmails: [writerEmail], taskId: created.id,
      });
    });
    onClose();
    const created = getState().tasks.find((t) => t.id === task.id);
    if (created) onOpen(created);
  };

  return (
    <Modal title="New article" onClose={onClose}>
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[10px] uppercase font-semibold text-gray-400">Working title</span>
          <input className="w-full px-3 py-2 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs bg-white dark:bg-neutral-800" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase font-semibold text-gray-400">Output</span>
          <select className="w-full px-3 py-2 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs bg-white dark:bg-neutral-800" value={kind} onChange={(e) => setKind(e.target.value as any)}>
            <option value="news-article">News article</option>
            <option value="news-feat">News feat</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase font-semibold text-gray-400">Writer</span>
          <select className="w-full px-3 py-2 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs bg-white dark:bg-neutral-800" value={writerEmail} onChange={(e) => setWriterEmail(e.target.value)}>
            {state.accounts.filter((a) => a.active && isWriterRole(a.role)).map((a) => <option key={a.email} value={a.email}>{a.name} — {a.role}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase font-semibold text-gray-400">Artx Google Doc link</span>
          <input className="w-full px-3 py-2 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs bg-white dark:bg-neutral-800 font-mono" value={artxLink} onChange={(e) => setArtxLink(e.target.value)} placeholder="https://docs.google.com/document/d/…" />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase font-semibold text-gray-400">Target posting date</span>
          <input type="date" className="w-full px-3 py-2 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs bg-white dark:bg-neutral-800" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-[11px] sm:text-xs">
          <input type="checkbox" checked={sameDay} onChange={(e) => setSameDay(e.target.checked)} className="w-4 h-4" />
          Same-day article — two editing tiers only
        </label>
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={!title.trim()}>Create card</Button>
        </div>
      </div>
    </Modal>
  );
}

export function PipelineDesk({ state, onOpen }: { state: NewsState; onOpen: (t: ArtxTask) => void }) {
  const active = state.tasks.filter((t) => !t.archived && t.stage !== "shelved");
  return (
    <Desk title="Pipeline oversight" note="Every article by the tier it is sitting on, with how long it has waited there.">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {PIPELINE_COLUMNS.map((col) => {
          const items = active.filter(col.match);
          return (
            <div key={col.key} className="glass-card rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-black uppercase tracking-wide text-gray-700 dark:text-neutral-200">{col.label}</h3>
                <Pill tone={items.length ? "blue" : "gray"}>{items.length}</Pill>
              </div>
              {items.length === 0 ? (
                <p className="text-[10px] text-gray-400 dark:text-neutral-500 italic">Nothing here.</p>
              ) : (
                <ul className="space-y-1.5">
                  {items.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => onOpen(t)} className="w-full text-left space-y-0.5 rounded-lg border border-gray-100 dark:border-neutral-800 p-2 hover:border-brand-maroon/40 cursor-pointer">
                        <span className="block text-[11px] font-bold text-gray-900 dark:text-neutral-100 truncate">{t.title}</span>
                        <span className="block text-[10px] text-gray-500 dark:text-neutral-400 truncate">
                          {t.writerName} · {stageLabel(t)} · {taskAgeLabel(t)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Desk>
  );
}

export function ArchiveDesk({ viewer, state, onOpen }: { viewer: Account; state: NewsState; onOpen: (t: ArtxTask) => void }) {
  const [member, setMember] = useState("all");
  const archived = state.tasks.filter((t) => t.archived || t.stage === "shelved");
  const rows = member === "all" ? archived : archived.filter((t) => t.writerEmail === member);
  return (
    <Desk title="Task archive" note={isEditorial(viewer.role) ? "Read any member's shelved or archived articles." : "Your shelved articles."}
      actions={isEditorial(viewer.role) && (
        <select className="px-3 py-2 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs bg-white dark:bg-neutral-800" value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="all">All members</option>
          {state.accounts.map((a) => <option key={a.email} value={a.email}>{a.name}</option>)}
        </select>
      )}
    >
      <Panel>
        {rows.length === 0 ? <Empty text="Nothing archived yet." /> : (
          <ul className="space-y-2">
            {rows.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-[11px] sm:text-xs border border-gray-100 dark:border-neutral-800 rounded-xl p-2.5">
                <button onClick={() => onOpen(t)} className="text-left min-w-0 cursor-pointer">
                  <span className="font-bold text-gray-900 dark:text-neutral-100 block truncate">{t.title}</span>
                  <span className="text-gray-500 dark:text-neutral-400">{t.writerName} · {stageLabel(t)}</span>
                </button>
                <Pill tone="gray">{new Date(t.updatedAt).toLocaleDateString()}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Desk>
  );
}

export function ReleasesDesk({ viewer, state, onOpen }: { viewer: Account; state: NewsState; onOpen: (t: ArtxTask) => void }) {
  const released = state.tasks.filter((t) => t.stage === "published" && !t.archived);
  const tracker = state.quickLinks.find((l) => l.id === "releases-tracker");
  return (
    <Desk title="Releases" note="Everything the section has published, newest first.">
      {isEditorial(viewer.role) && (
        <Panel title="Releases tracker">
          {tracker?.url ? (
            <a href={tracker.url} target="_blank" rel="noopener noreferrer" className="text-[11px] sm:text-xs font-bold text-brand-maroon dark:text-red-400 hover:underline break-all">
              {tracker.url}
            </a>
          ) : (
            <p className="text-[11px] text-gray-500 dark:text-neutral-400">
              No releases tracker link set. Add one under Settings so this desk points at the sheet.
            </p>
          )}
        </Panel>
      )}
      <Panel>
        {released.length === 0 ? <Empty text="No published articles recorded yet." /> : (
          <ul className="divide-y divide-gray-100 dark:divide-neutral-800">
            {released.map((t) => (
              <li key={t.id}>
                <button onClick={() => onOpen(t)} className="w-full flex items-center justify-between gap-3 py-2 text-left cursor-pointer">
                  <span className="min-w-0">
                    <span className="block text-[11px] sm:text-xs font-bold text-gray-900 dark:text-neutral-100 truncate">{t.title}</span>
                    <span className="block text-[10px] text-gray-500 dark:text-neutral-400">{t.writerName} · {t.kind === "news-feat" ? "News Feat" : "News Article"}</span>
                  </span>
                  <span className="shrink-0"><Pill tone="green">{new Date(t.publishedAt || t.updatedAt).toLocaleDateString()}</Pill></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Desk>
  );
}
