import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  Check,
  ClipboardList,
  Download,
  FileText,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  ATTENDANCE_STATES,
  DISPO_CATEGORIES,
  DispoResponses,
  SecMeet,
  SecMeetItem,
  SecMeetProgress,
  SecMeetStatus,
  TeamMember,
  UserRole,
  emptyDispo,
  normalizeEmail,
} from "../types";
import { getSecMeetRoster, SecMeetRosterEntry } from "../lib/memberUtils";
import { formatSecMeetDate, ordinalOf } from "../lib/secMeetFormat";
import {
  addSecMeetItem,
  createSecMeet,
  deleteSecMeet,
  deleteSecMeetItem,
  reorderSecMeetItems,
  saveSecMeetMinutes,
  saveSecMeetProgress,
  setSecMeetAttendance,
  updateSecMeet,
  updateSecMeetItem,
} from "../lib/supabase";

/**
 * SecMeets — the section's meeting desk.
 *
 * The permission matrix is enforced twice: a control a member may not use is not
 * rendered, and supabase/migrations/20261117000000_sec_meets.sql refuses the same
 * write at row level. The second half is what actually protects async progress,
 * where a member must not reach anybody else's completion status or Dispo Check
 * answers even by querying the API directly.
 */

interface SecMeetsProps {
  meetings: SecMeet[];
  /** Whatever this session is allowed to see: a member's own rows, or every
      row for the Editor and Deputy. */
  progress: SecMeetProgress[];
  members: TeamMember[];
  currentUserEmail: string;
  currentUserName: string;
  currentUserRole: UserRole;
  onChanged: () => void;
}

const STATUSES: SecMeetStatus[] = ["Not Started", "In Progress", "Completed"];

/** What the Layout Editor may change about a meeting once it exists. Its type
    and its sequence number are fixed when it is created. */
type MeetingPatch = Partial<Pick<SecMeet, "title" | "status" | "meetingDate" | "details">>;

const primaryButton =
  "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-maroon hover:bg-brand-maroon-dark text-white text-[10px] sm:text-[11px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const ghostButton =
  "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[10px] sm:text-[11px] font-bold text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const inputClass =
  "w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[11px] sm:text-xs text-neutral-800 dark:text-neutral-200 outline-none focus:ring-1 focus:ring-brand-maroon disabled:opacity-60";

const toneCompleted = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900";
const tonePartial = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
const toneIdle = "bg-neutral-100 text-neutral-600 border-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700";
const toneSync = "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900";
const toneAsync = "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900";

function statusTone(status: SecMeetStatus): string {
  if (status === "Completed") return toneCompleted;
  if (status === "In Progress") return tonePartial;
  return toneIdle;
}

function Pill({ children, className = "", title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function Card({
  icon: Icon, title, note, action, children
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
      <div className="px-3 sm:px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-4 h-4 text-brand-maroon shrink-0" />
          <div className="min-w-0">
            <h3 className="text-xs font-black text-neutral-900 dark:text-neutral-100 truncate">{title}</h3>
            {note && <p className="text-[10px] text-neutral-500 dark:text-neutral-400">{note}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

/** Wraps one write so the desk shows a single busy/error state while it runs.
    A helper returning false means the database refused it — the row level
    policies are the authority on who may write, so the refusal is surfaced
    rather than swallowed. */
type Write = <Args extends unknown[]>(
  action: (...args: Args) => Promise<unknown>
) => (...args: Args) => Promise<void>;
export default function SecMeets({
  meetings, progress, members, currentUserEmail, currentUserName, currentUserRole, onChanged
}: SecMeetsProps) {
  const isEditor = currentUserRole === "Layout Editor";
  const isLead = isEditor || currentUserRole === "Layout Deputy";
  const myEmail = normalizeEmail(currentUserEmail).toLowerCase();
  const roster = useMemo(() => getSecMeetRoster(members), [members]);

  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const meeting = meetings.find((entry) => entry.id === activeId) || meetings[0] || null;

  useEffect(() => {
    if (meeting && activeId !== meeting.id) setActiveId(meeting.id);
  }, [meeting, activeId]);

  const write = <Args extends unknown[]>(action: (...args: Args) => Promise<unknown>) =>
    async (...args: Args): Promise<void> => {
      setBusy(true);
      setError("");
      try {
        const ok = await action(...args);
        if (ok === false) setError("That change was refused. Sign in again if it keeps happening.");
        else onChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : "That change could not be saved.");
      } finally {
        setBusy(false);
      }
    };

  return (
    <section className="bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden text-left">
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-neutral-50 to-neutral-100/50 dark:from-neutral-800 dark:to-neutral-800/60 border-b border-neutral-200/70 dark:border-neutral-700">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="p-1.5 bg-brand-maroon/10 rounded-xl text-brand-maroon shrink-0">
            <CalendarCheck className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-sans font-black text-sm sm:text-base text-stone-900 dark:text-neutral-100 tracking-tight">SecMeets</h2>
            <p className="text-[10px] sm:text-[11px] text-stone-500 dark:text-neutral-400 font-medium">
              Section meetings: attendance, agenda and minutes for a synchronous meeting; tasks and Dispo Check for an asynchronous one.
            </p>
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-5 pt-3 sm:pt-4">
        <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
          {meetings.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setActiveId(entry.id)}
              className={`shrink-0 text-left px-3 py-2 rounded-xl border min-w-[168px] cursor-pointer transition-colors ${
                meeting && entry.id === meeting.id
                  ? "border-brand-maroon bg-brand-maroon/5 dark:bg-brand-maroon/10"
                  : "border-neutral-200 dark:border-neutral-800 hover:border-brand-maroon/40"
              }`}
            >
              <span className="block text-[11px] font-black text-neutral-900 dark:text-neutral-100 truncate">{entry.title}</span>
              <span className="mt-1 flex items-center gap-1.5">
                <Pill className={entry.kind === "synchronous" ? toneSync : toneAsync}>
                  {entry.kind === "synchronous" ? "Sync" : "Async"}
                </Pill>
                <Pill className={statusTone(entry.status)}>{entry.status}</Pill>
              </span>
            </button>
          ))}
          {isEditor && <NewMeetingButton meetings={meetings} onCreated={onChanged} onError={setError} />}
        </div>
      </div>

      {(error || busy) && (
        <div className="px-3 sm:px-5 pt-2">
          {error
            ? <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{error}</p>
            : <p className="text-[11px] font-semibold text-neutral-400">Saving…</p>}
        </div>
      )}

      <div className="p-3 sm:p-5 space-y-3 sm:space-y-4">
        {!meeting ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {isEditor ? "Create the first meeting tab to start recording section meetings." : "No section meeting has been created yet."}
          </p>
        ) : (
          <>
            <MeetingInfo
              meeting={meeting}
              roster={roster}
              progress={progress}
              isEditor={isEditor}
              isLead={isLead}
              busy={busy}
              onSave={write((patch: MeetingPatch) => updateSecMeet(meeting.id, patch))}
              onDelete={write(async () => {
                if (!window.confirm(`Remove '${meeting.title}'? Its agenda, attendance, minutes and member progress go with it.`)) return true;
                return deleteSecMeet(meeting.id);
              })}
              onError={setError}
            />

            {meeting.kind === "synchronous" ? (
              <SynchronousMeeting meeting={meeting} roster={roster} isEditor={isEditor} isLead={isLead} busy={busy} myName={currentUserName} write={write} />
            ) : (
              <AsynchronousMeeting meeting={meeting} roster={roster} progress={progress} isEditor={isEditor} isLead={isLead} busy={busy} myEmail={myEmail} write={write} />
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Meeting tabs                                                               */
/* -------------------------------------------------------------------------- */

function NewMeetingButton({ meetings, onCreated, onError }: { meetings: SecMeet[]; onCreated: () => void; onError: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const nextSeq = (meetings.reduce((highest, entry) => Math.max(highest, entry.seq), 0) || 0) + 1;

  return (
    <div className="shrink-0 relative">
      <button onClick={() => setOpen((value) => !value)} className={ghostButton} title="Create a meeting tab">
        <Plus className="w-3.5 h-3.5" /> New meeting
      </button>
      {open && (
        <div className="absolute z-20 right-0 mt-2 w-[280px] rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg p-3">
          <NewMeetingForm
            nextSeq={nextSeq}
            onError={onError}
            onCreated={() => { setOpen(false); onCreated(); }}
          />
        </div>
      )}
    </div>
  );
}

function NewMeetingForm({ nextSeq, onCreated, onError }: { nextSeq: number; onCreated: () => void; onError: (message: string) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"synchronous" | "asynchronous">("synchronous");
  const [meetingDate, setMeetingDate] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = title.trim() || `${ordinalOf(nextSeq)} Section Meeting`;
    setSaving(true);
    const created = await createSecMeet({ title: trimmed, kind, meetingDate, details });
    setSaving(false);
    if (!created) {
      onError("The meeting could not be created. Only the Layout Editor can add one.");
      return;
    }
    setTitle("");
    setMeetingDate("");
    setDetails("");
    onCreated();
  };

  return (
    <div className="space-y-2">
      <label className="block space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Title</span>
        <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`${ordinalOf(nextSeq)} Section Meeting`} />
      </label>
      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Meeting type</span>
        <div className="flex gap-1.5">
          {(["synchronous", "asynchronous"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setKind(option)}
              className={`flex-1 px-2 py-1.5 rounded-lg border text-[10px] font-bold capitalize cursor-pointer ${
                kind === option
                  ? "border-brand-maroon bg-brand-maroon/10 text-brand-maroon dark:text-brand-maroon-light"
                  : "border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Meeting date</span>
        <input type="date" className={inputClass} value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} />
      </label>
      <label className="block space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Details</span>
        <textarea rows={2} className={inputClass} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Where it was held, what it covered" />
      </label>
      <div className="flex justify-end">
        <button onClick={submit} disabled={saving} className={primaryButton}>
          <Check className="w-3.5 h-3.5" /> {saving ? "Creating…" : "Create"}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Meeting info + PDF export                                                  */
/* -------------------------------------------------------------------------- */

function MeetingInfo({
  meeting, roster, progress, isEditor, isLead, busy, onSave, onDelete, onError
}: {
  meeting: SecMeet;
  roster: SecMeetRosterEntry[];
  progress: SecMeetProgress[];
  isEditor: boolean;
  isLead: boolean;
  busy: boolean;
  onSave: (patch: MeetingPatch) => Promise<void>;
  onDelete: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(meeting.title);
  const [status, setStatus] = useState<SecMeetStatus>(meeting.status);
  const [meetingDate, setMeetingDate] = useState(meeting.meetingDate);
  const [details, setDetails] = useState(meeting.details);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setEditing(false);
    setTitle(meeting.title);
    setStatus(meeting.status);
    setMeetingDate(meeting.meetingDate);
    setDetails(meeting.details);
  }, [meeting.id, meeting.title, meeting.status, meeting.meetingDate, meeting.details]);

  const exportPdf = async () => {
    setExporting(true);
    try {
      // jsPDF is pulled in only when a member exports, the way the release
      // tracker pulls in ExcelJS, so it stays out of the main bundle.
      const { exportSecMeetPdf } = await import("../lib/secMeetPdf");
      await exportSecMeetPdf({ meeting, roster, progress, viewerIsLead: isLead });
    } catch (err) {
      onError(err instanceof Error ? err.message : "The PDF could not be built.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-800/40 p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-black text-neutral-900 dark:text-neutral-100">{meeting.title}</h3>
            <Pill className={meeting.kind === "synchronous" ? toneSync : toneAsync}>
              {meeting.kind === "synchronous" ? "Synchronous" : "Asynchronous"}
            </Pill>
            <Pill className={statusTone(meeting.status)}>{meeting.status}</Pill>
          </div>
          <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-300">
            {ordinalOf(meeting.seq)} Layout SecMeet
            {meeting.meetingDate ? ` · ${formatSecMeetDate(meeting.meetingDate)}` : " · no date set"}
          </p>
          {meeting.details && (
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap">{meeting.details}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {meeting.kind === "synchronous" && (
            <button onClick={exportPdf} disabled={exporting} className={primaryButton} title="Export these minutes as a PDF">
              <Download className="w-3.5 h-3.5" /> {exporting ? "Preparing…" : "Export as PDF"}
            </button>
          )}
          {isEditor && !editing && (
            <button onClick={() => setEditing(true)} className={ghostButton} title="Edit this meeting">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {isEditor && !editing && (
            <button onClick={onDelete} disabled={busy} className={ghostButton} title="Remove this meeting" aria-label="Remove this meeting">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Title</span>
            <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Status</span>
            <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as SecMeetStatus)}>
              {STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Meeting date</span>
            <input type="date" className={inputClass} value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Details</span>
            <textarea rows={2} className={inputClass} value={details} onChange={(event) => setDetails(event.target.value)} />
          </label>
          <div className="sm:col-span-2 flex justify-end gap-1.5">
            <button onClick={() => setEditing(false)} className={ghostButton}><X className="w-3.5 h-3.5" /> Cancel</button>
            <button
              onClick={async () => { await onSave({ title, status, meetingDate, details }); setEditing(false); }}
              disabled={busy || !title.trim()}
              className={primaryButton}
            >
              <Check className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Synchronous meeting                                                        */
/* -------------------------------------------------------------------------- */

function SynchronousMeeting({
  meeting, roster, isEditor, isLead, busy, myName, write
}: {
  meeting: SecMeet;
  roster: SecMeetRosterEntry[];
  isEditor: boolean;
  isLead: boolean;
  busy: boolean;
  myName: string;
  write: Write;
}) {
  return (
    <>
      <AttendanceCard meeting={meeting} roster={roster} isLead={isLead} busy={busy} write={write} />
      <ItemListCard
        title="Agenda"
        note={isEditor ? "Only the Layout Editor adds, renames and removes agenda points." : "Set by the Layout Editor."}
        icon={ClipboardList}
        items={meeting.agenda}
        canEdit={isEditor}
        busy={busy}
        placeholder="An agenda point"
        emptyText="No agenda points yet."
        onAdd={write((title: string) =>
          addSecMeetItem({ meetingId: meeting.id, kind: "agenda", title }))}
        onRename={write((id: string, title: string) => updateSecMeetItem(id, title))}
        onDelete={write((id: string) => deleteSecMeetItem(id))}
        onReorder={write((ids: string[]) => reorderSecMeetItems(ids))}
      />
      <MinutesCard meeting={meeting} isLead={isLead} busy={busy} myName={myName} write={write} />
    </>
  );
}

function AttendanceCard({
  meeting, roster, isLead, busy, write
}: {
  meeting: SecMeet;
  roster: SecMeetRosterEntry[];
  isLead: boolean;
  busy: boolean;
  write: Write;
}) {
  const tally = ATTENDANCE_STATES.map((state) => ({
    ...state,
    count: roster.filter((entry) => meeting.attendance[entry.email] === state.value).length
  }));
  const unmarked = roster.filter((entry) => !meeting.attendance[entry.email]).length;

  return (
    <Card
      icon={Users}
      title="Attendance"
      note={isLead ? "Mark each member P, L, E or A. Click a marked letter again to clear it." : "Marked by the Layout Editor and Deputy."}
      action={
        <div className="hidden sm:flex items-center gap-1">
          {tally.map((entry) => (
            <Pill key={entry.value} className={`${toneIdle} normal-case`} title={`${entry.meaning}: ${entry.count}`}>
              {entry.value} {entry.count}
            </Pill>
          ))}
          {unmarked > 0 && <Pill className={`${toneIdle} normal-case text-neutral-400`}>unmarked {unmarked}</Pill>}
        </div>
      }
    >
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {roster.map((entry) => {
          const current = meeting.attendance[entry.email];
          return (
            <li key={entry.email} className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200/70 dark:border-neutral-800 px-2.5 py-1.5">
              <span className="min-w-0">
                <span className="block text-[11px] font-bold text-neutral-900 dark:text-neutral-100 truncate">{entry.displayName}</span>
                <span className="block text-[10px] text-neutral-500 dark:text-neutral-400 truncate">{entry.officialName}</span>
              </span>
              <span className="flex items-center gap-0.5 shrink-0">
                {ATTENDANCE_STATES.map((state) => {
                  const selected = current === state.value;
                  return (
                    <button
                      key={state.value}
                      disabled={!isLead || busy}
                      onClick={write(() =>
                        setSecMeetAttendance(meeting.id, entry.email, selected ? null : state.value))}
                      title={state.meaning}
                      aria-label={`${entry.displayName}: ${state.meaning}`}
                      aria-pressed={selected}
                      className={`w-6 h-6 rounded-md border text-[10px] font-black cursor-pointer disabled:cursor-not-allowed ${
                        selected
                          ? "border-brand-maroon bg-brand-maroon text-white"
                          : "border-neutral-200 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 hover:border-brand-maroon/50"
                      }`}
                    >
                      {state.value}
                    </button>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>
      {roster.length === 0 && <p className="text-[11px] text-neutral-500 dark:text-neutral-400">No layout members are in the directory yet.</p>}
    </Card>
  );
}

/**
 * The agenda and the async task list are the same shape — an ordered list of
 * lines the Layout Editor owns — so they share one editor. `renderExtra` is
 * where the async desk hangs each member's own checkbox or Dispo Check form.
 */
function ItemListCard({
  title, note, icon: Icon, items, canEdit, busy, placeholder, emptyText,
  onAdd, onRename, onDelete, onReorder, renderExtra
}: {
  title: string;
  note: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SecMeetItem[];
  canEdit: boolean;
  busy: boolean;
  placeholder: string;
  emptyText: string;
  onAdd: (title: string) => Promise<void>;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
  renderExtra?: (item: SecMeetItem, index: number) => React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState("");
  const [renameValue, setRenameValue] = useState("");

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = items.map((item) => item.id);
    [next[index], next[target]] = [next[target], next[index]];
    void onReorder(next);
  };

  const commitRename = async (id: string) => {
    if (!renameValue.trim()) return;
    await onRename(id, renameValue.trim());
    setRenaming("");
  };

  return (
    <Card icon={Icon} title={title} note={note}>
      {items.length === 0 && <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{emptyText}</p>}
      <ol className="space-y-1.5">
        {items.map((item, index) => (
          <li key={item.id} className="rounded-lg border border-neutral-200/70 dark:border-neutral-800 px-2.5 py-2">
            <div className="flex items-start gap-2">
              <span className="text-[11px] font-black text-neutral-400 dark:text-neutral-500 pt-0.5 w-5 shrink-0">{index + 1}.</span>
              {renaming === item.id ? (
                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                  <input
                    autoFocus
                    className={inputClass}
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void commitRename(item.id);
                      if (event.key === "Escape") setRenaming("");
                    }}
                  />
                  <button onClick={() => void commitRename(item.id)} disabled={busy || !renameValue.trim()} className={primaryButton} aria-label="Save the new title">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setRenaming("")} className={ghostButton} aria-label="Keep the current title">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span className="flex-1 min-w-0 text-[11px] sm:text-xs font-semibold text-neutral-800 dark:text-neutral-200 pt-0.5">{item.title}</span>
              )}
              {canEdit && renaming !== item.id && (
                <span className="flex items-center gap-0.5 shrink-0">
                  <button disabled={busy || index === 0} onClick={() => move(index, -1)} className="p-1 rounded-md text-neutral-400 hover:text-brand-maroon disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed" title="Move up" aria-label={`Move ${item.title} up`}>
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button disabled={busy || index === items.length - 1} onClick={() => move(index, 1)} className="p-1 rounded-md text-neutral-400 hover:text-brand-maroon disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed" title="Move down" aria-label={`Move ${item.title} down`}>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setRenaming(item.id); setRenameValue(item.title); }} disabled={busy} className="p-1 rounded-md text-neutral-400 hover:text-brand-maroon disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed" title="Rename" aria-label={`Rename ${item.title}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => { if (window.confirm(`Remove '${item.title}'?${item.kind === "task" ? " Every member's progress on it goes too." : ""}`)) void onDelete(item.id); }}
                    className="p-1 rounded-md text-neutral-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    title="Remove"
                    aria-label={`Remove ${item.title}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
            {renderExtra?.(item, index)}
          </li>
        ))}
      </ol>

      {canEdit && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <input
            className={inputClass}
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && draft.trim()) {
                void onAdd(draft.trim());
                setDraft("");
              }
            }}
          />
          <button
            disabled={busy || !draft.trim()}
            onClick={async () => { await onAdd(draft.trim()); setDraft(""); }}
            className={primaryButton}
          >
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      )}
    </Card>
  );
}

function MinutesCard({
  meeting, isLead, busy, myName, write
}: {
  meeting: SecMeet;
  isLead: boolean;
  busy: boolean;
  myName: string;
  write: Write;
}) {
  const [draft, setDraft] = useState(meeting.minutes);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setEditing(false); }, [meeting.id]);
  // A realtime reload must not throw away what the lead is typing: the stored
  // minutes only overwrite the draft while it is untouched.
  useEffect(() => { if (editing) return; setDraft(meeting.minutes); }, [meeting.minutes, editing]);
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2500);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const changed = draft !== meeting.minutes;

  return (
    <Card
      icon={FileText}
      title="Minutes"
      note="Written by the Layout Editor and Deputy; everyone else reads."
      action={
        isLead ? (
          <div className="flex items-center gap-1.5">
            {saved && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Saved</span>}
            <button
              disabled={busy || !changed}
              onClick={write(async () => {
                const ok = await saveSecMeetMinutes(meeting.id, draft, myName);
                if (ok) { setEditing(false); setSaved(true); }
                return ok;
              })}
              className={primaryButton}
            >
              <Check className="w-3.5 h-3.5" /> Save minutes
            </button>
          </div>
        ) : undefined
      }
    >
      {isLead ? (
        <textarea
          rows={12}
          className={`${inputClass} leading-relaxed resize-y`}
          value={draft}
          disabled={busy}
          placeholder="One point per line. Line breaks are kept exactly as typed, and each line is numbered in the exported minutes."
          onChange={(event) => setDraft(event.target.value)}
        />
      ) : meeting.minutes ? (
        <p className="text-[11px] sm:text-xs text-neutral-800 dark:text-neutral-200 whitespace-pre-wrap leading-relaxed">{meeting.minutes}</p>
      ) : (
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">No minutes have been written yet.</p>
      )}
      {meeting.minutesUpdatedBy && (
        <p className="mt-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">Last written by {meeting.minutesUpdatedBy}</p>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Asynchronous meeting                                                       */
/* -------------------------------------------------------------------------- */

function AsynchronousMeeting({
  meeting, roster, progress, isEditor, isLead, busy, myEmail, write
}: {
  meeting: SecMeet;
  roster: SecMeetRosterEntry[];
  progress: SecMeetProgress[];
  isEditor: boolean;
  isLead: boolean;
  busy: boolean;
  myEmail: string;
  write: Write;
}) {
  // A member only ever holds their own rows here, so this map cannot contain
  // anybody else's status even if the desk tried to read one.
  const mine = useMemo(() => {
    const byItem = new Map<string, SecMeetProgress>();
    progress.forEach((row) => { if (row.memberEmail === myEmail) byItem.set(row.itemId, row); });
    return byItem;
  }, [progress, myEmail]);

  const myDone = meeting.tasks.filter((task) => mine.get(task.id)?.done).length;

  return (
    <>
      <ItemListCard
        title="Tasks"
        note={isEditor
          ? "Only the Layout Editor creates, renames, removes and rearranges tasks. Each member marks their own."
          : `Yours alone — ${myDone} of ${meeting.tasks.length} done. Nobody else's progress is shown here.`}
        icon={ListChecks}
        items={meeting.tasks}
        canEdit={isEditor}
        busy={busy}
        placeholder="A task for every member"
        emptyText="No tasks yet."
        onAdd={write((title: string) =>
          addSecMeetItem({ meetingId: meeting.id, kind: "task", title }))}
        onRename={write((id: string, title: string) => updateSecMeetItem(id, title))}
        onDelete={write((id: string) => deleteSecMeetItem(id))}
        onReorder={write((ids: string[]) => reorderSecMeetItems(ids))}
        renderExtra={(item) => item.itemKind === "dispo" ? (
          <DispoForm
            meeting={meeting}
            item={item}
            myEmail={myEmail}
            saved={mine.get(item.id)?.dispo ?? null}
            done={Boolean(mine.get(item.id)?.done)}
            busy={busy}
            write={write}
          />
        ) : (
          <div className="mt-1.5 ml-7">
            <button
              disabled={busy}
              onClick={write(() => saveSecMeetProgress({
                itemId: item.id,
                meetingId: meeting.id,
                memberEmail: myEmail,
                done: !mine.get(item.id)?.done
              }))}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-neutral-700 dark:text-neutral-200 cursor-pointer disabled:opacity-60"
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                mine.get(item.id)?.done
                  ? "bg-brand-maroon border-brand-maroon text-white"
                  : "border-neutral-300 dark:border-neutral-600"
              }`}>
                {mine.get(item.id)?.done && <Check className="w-3 h-3" />}
              </span>
              {mine.get(item.id)?.done ? "Done — click to undo" : "Mark as done"}
            </button>
          </div>
        )}
      />

      {isLead && <MonitoringCard meeting={meeting} roster={roster} progress={progress} />}
    </>
  );
}

function DispoForm({
  meeting, item, myEmail, saved, done, busy, write
}: {
  meeting: SecMeet;
  item: SecMeetItem;
  myEmail: string;
  saved: DispoResponses | null;
  done: boolean;
  busy: boolean;
  write: Write;
}) {
  const [draft, setDraft] = useState<DispoResponses>(saved ?? emptyDispo());
  const [notice, setNotice] = useState("");
  // A reload of the desk must not throw away what the member is typing: the
  // stored answers only overwrite the draft while it is untouched.
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setDirty(false); }, [item.id]);
  useEffect(() => {
    if (dirty) return;
    setDraft(saved ?? emptyDispo());
  }, [item.id, saved, dirty]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filled = DISPO_CATEGORIES.filter((category) => (draft[category.key] || "").trim()).length;

  return (
    <div className="mt-2 ml-7 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50/70 dark:bg-neutral-800/40 p-2.5 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Your Dispo Check — seen only by you and the leads
        </p>
        <span className="flex items-center gap-1.5">
          {notice && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{notice}</span>}
          <Pill className={done ? toneCompleted : toneIdle}>{done ? "Complete" : `${filled} of ${DISPO_CATEGORIES.length} filled`}</Pill>
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {DISPO_CATEGORIES.map((category) => (
          <label key={category.key} className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{category.label}</span>
            <textarea
              rows={2}
              className={inputClass}
              value={draft[category.key] || ""}
              disabled={busy}
              placeholder={`How things are going with ${category.label.toLowerCase()}`}
              onChange={(event) => { setDirty(true); setDraft({ ...draft, [category.key]: event.target.value }); }}
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          disabled={busy}
          onClick={write(async () => {
            // Completion is derived from the answers rather than ticked by hand:
            // the task only counts as done once all four categories are in.
            const complete = DISPO_CATEGORIES.every((category) => (draft[category.key] || "").trim());
            const ok = await saveSecMeetProgress({
              itemId: item.id,
              meetingId: meeting.id,
              memberEmail: myEmail,
              done: complete,
              dispo: draft
            });
            if (ok) {
              setDirty(false);
              setNotice("Saved");
            }
            return ok;
          })}
          className={primaryButton}
        >
          <Check className="w-3.5 h-3.5" /> Save my Dispo Check
        </button>
      </div>
    </div>
  );
}

function MonitoringCard({
  meeting, roster, progress
}: {
  meeting: SecMeet;
  roster: SecMeetRosterEntry[];
  progress: SecMeetProgress[];
}) {
  const [open, setOpen] = useState("");
  const tasks = meeting.tasks;

  const rows = roster.map((entry) => {
    const mine = tasks.map((task) => progress.find((row) => row.itemId === task.id && row.memberEmail === entry.email) || null);
    const done = mine.filter((row) => row?.done).length;
    const dispoIndex = tasks.findIndex((task) => task.itemKind === "dispo");
    const dispo = dispoIndex >= 0 ? mine[dispoIndex]?.dispo ?? null : null;
    // Answering part of the Dispo Check counts as having started, even though the
    // task itself only completes once all four categories are in.
    const started = done > 0 || (dispo ? DISPO_CATEGORIES.some((category) => (dispo[category.key] || "").trim() !== "") : false);
    return {
      entry,
      mine,
      done,
      state: tasks.length === 0 ? "Not Started" : done === tasks.length ? "Completed" : started ? "Partially Completed" : "Not Started",
      dispo
    };
  });

  const countOf = (state: string) => rows.filter((row) => row.state === state).length;

  return (
    <Card
      icon={Users}
      title="Member progress"
      note="Layout Editor and Deputy only."
      action={
        <div className="hidden sm:flex items-center gap-1">
          <Pill className={`${toneCompleted} normal-case`}>{countOf("Completed")} completed</Pill>
          <Pill className={`${tonePartial} normal-case`}>{countOf("Partially Completed")} partial</Pill>
          <Pill className={`${toneIdle} normal-case`}>{countOf("Not Started")} not started</Pill>
        </div>
      }
    >
      {tasks.length === 0 && <p className="text-[11px] text-neutral-500 dark:text-neutral-400">No tasks to monitor yet.</p>}
      <ul className="space-y-1.5">
        {rows.map(({ entry, mine, done, state, dispo }) => (
          <li key={entry.email} className="rounded-lg border border-neutral-200/70 dark:border-neutral-800">
            <button
              onClick={() => setOpen(open === entry.email ? "" : entry.email)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-2 cursor-pointer text-left"
              aria-expanded={open === entry.email}
            >
              <span className="min-w-0">
                <span className="block text-[11px] font-bold text-neutral-900 dark:text-neutral-100 truncate">{entry.displayName}</span>
                <span className="block text-[10px] text-neutral-500 dark:text-neutral-400">{done} of {tasks.length} tasks done</span>
              </span>
              <Pill className={state === "Completed" ? toneCompleted : state === "Partially Completed" ? tonePartial : toneIdle}>
                {state}
              </Pill>
            </button>
            {open === entry.email && (
              <div className="px-2.5 pb-2.5 pt-2 space-y-1.5 border-t border-neutral-100 dark:border-neutral-800">
                <ul className="space-y-1">
                  {tasks.map((task, index) => (
                    <li key={task.id} className="flex items-center gap-2 text-[11px] text-neutral-700 dark:text-neutral-300">
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                        mine[index]?.done ? "bg-brand-maroon border-brand-maroon text-white" : "border-neutral-300 dark:border-neutral-600"
                      }`}>
                        {mine[index]?.done && <Check className="w-2.5 h-2.5" />}
                      </span>
                      {task.title}
                    </li>
                  ))}
                </ul>
                {dispo && (
                  <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-2 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Dispo Check</p>
                    {DISPO_CATEGORIES.map((category) => (
                      <p key={category.key} className="text-[11px] text-neutral-700 dark:text-neutral-300">
                        <span className="font-bold">{category.label}:</span> {dispo[category.key] || "—"}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
