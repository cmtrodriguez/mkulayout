// Home desk: the templates the section works out of, the timeline calendar, and the
// to-do deadline tracker. The template URLs are not something this app can invent, so an
// unlinked row says so and points at Settings.
import { useState } from "react";
import { CalendarDays, CheckSquare, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { Account, TimelineEvent, Todo } from "../types";
import { NewsState, mutate, nameOf, newId } from "../lib/store";
import { MKULAYOUT_URL, isEditorial } from "../lib/workflow";
import { Button, Desk, Empty, Field, INPUT, Modal, Panel, Pill, two } from "./ui";

const EVENT_KINDS: { key: TimelineEvent["kind"]; label: string; tone: string }[] = [
  { key: "deadline", label: "Deadline", tone: "red" },
  { key: "interview", label: "Interview", tone: "blue" },
  { key: "meeting", label: "Meeting", tone: "amber" },
  { key: "release", label: "Release", tone: "green" },
];

function iso(y: number, m: number, d: number): string {
  return `${y}-${two(m + 1)}-${two(d)}`;
}

function Calendar({ state, monthOffset, onShift }: { state: NewsState; monthOffset: number; onShift: (n: number) => void }) {
  const base = new Date();
  const cursor = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first grid
  const count = new Date(year, month + 1, 0).getDate();
  const today = iso(base.getFullYear(), base.getMonth(), base.getDate());

  const marks: Record<string, { events: TimelineEvent[]; todos: Todo[] }> = {};
  const note = (key: string) => (marks[key] = marks[key] || { events: [], todos: [] });
  state.events.forEach((e) => { const k = e.date.slice(0, 10); if (k) note(k).events.push(e); });
  state.todos.filter((t) => !t.done && /^\d{4}-\d{2}-\d{2}$/.test(t.due)).forEach((t) => note(t.due).todos.push(t));

  return (
    <Panel
      title={cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      right={
        <div className="flex items-center gap-1.5">
          <Button tone="ghost" onClick={() => onShift(monthOffset - 1)} aria-label="Previous month">‹</Button>
          <Button tone="ghost" onClick={() => onShift(0)} aria-label="This month">Today</Button>
          <Button tone="ghost" onClick={() => onShift(monthOffset + 1)} aria-label="Next month">›</Button>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-1 text-center">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d} className="text-[9px] sm:text-[10px] uppercase font-bold text-gray-400 dark:text-neutral-500 py-1">{d}</span>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => <span key={`pad-${i}`} />)}
        {Array.from({ length: count }).map((_, i) => {
          const day = i + 1;
          const key = iso(year, month, day);
          const cell = marks[key];
          return (
            <div
              key={key}
              className={`rounded-lg border p-1 min-h-[52px] sm:min-h-[64px] text-left flex flex-col gap-0.5 ${
                key === today
                  ? "border-brand-maroon bg-brand-maroon/5 dark:bg-brand-maroon/15"
                  : "border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900"
              }`}
            >
              <span className={`text-[10px] sm:text-[11px] font-bold ${key === today ? "text-brand-maroon dark:text-brand-maroon-light" : "text-gray-600 dark:text-neutral-300"}`}>{day}</span>
              {cell?.events.slice(0, 2).map((e) => (
                <span key={e.id} className="truncate text-[8px] sm:text-[9px] font-semibold px-1 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">{e.title}</span>
              ))}
              {cell?.todos.slice(0, 2).map((t) => (
                <span key={t.id} className="truncate text-[8px] sm:text-[9px] font-semibold px-1 rounded bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">{t.title}</span>
              ))}
              {cell && cell.events.length + cell.todos.length > 4 && (
                <span className="text-[8px] text-gray-400 dark:text-neutral-500 px-1">+{cell.events.length + cell.todos.length - 4}</span>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function EventModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(iso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
  const [kind, setKind] = useState<TimelineEvent["kind"]>("deadline");
  const [notes, setNotes] = useState("");

  return (
    <Modal title="Add to the timeline" onClose={onClose}>
      <div className="space-y-3">
        <Field label="What happens">
          <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Interview with the registrar, deadline for drafts…" />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Date">
            <input type="date" className={INPUT} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Type">
            <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value as TimelineEvent["kind"])}>
              {EVENT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <textarea rows={2} className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button tone="ghost" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date)}
          onClick={() => {
            mutate((draft) => { draft.events = [{ id: newId("evt"), title: title.trim(), date, kind, notes: notes.trim() }, ...draft.events]; });
            onClose();
          }}
        >
          Add event
        </Button>
      </div>
    </Modal>
  );
}

function TodoModal({ viewer, state, onClose }: { viewer: Account; state: NewsState; onClose: () => void }) {
  const leads = isEditorial(viewer.role);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(iso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
  const [owner, setOwner] = useState(viewer.email);

  return (
    <Modal title="Add a deadline" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Task">
          <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Follow up on the quote for…" />
        </Field>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Due">
            <input type="date" className={INPUT} value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Owner">
            <select className={INPUT} value={owner} disabled={!leads} onChange={(e) => setOwner(e.target.value)}>
              {state.accounts.map((a) => <option key={a.email} value={a.email}>{a.name}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button tone="ghost" onClick={onClose}>Cancel</Button>
        <Button
          disabled={!title.trim()}
          onClick={() => {
            mutate((draft) => {
              draft.todos = [{ id: newId("todo"), ownerEmail: owner, title: title.trim(), due, done: false, createdAt: new Date().toISOString() }, ...draft.todos];
            });
            onClose();
          }}
        >
          Add deadline
        </Button>
      </div>
    </Modal>
  );
}

export default function HomeDesk({ viewer, state }: { viewer: Account; state: NewsState }) {
  const leads = isEditorial(viewer.role);
  const [monthOffset, setMonthOffset] = useState(0);
  const [addingEvent, setAddingEvent] = useState(false);
  const [addingTodo, setAddingTodo] = useState(false);
  const [showAllTodos, setShowAllTodos] = useState(false);

  const todos = state.todos
    .filter((t) => (leads && showAllTodos) || t.ownerEmail.toLowerCase() === viewer.email.toLowerCase())
    .sort((a, b) => (a.done === b.done ? a.due.localeCompare(b.due) : a.done ? 1 : -1));
  const upcoming = state.events
    .filter((e) => e.date.slice(0, 10) >= iso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  return (
    <Desk
      title={`Good day, ${viewer.name.split(" ")[0]}`}
      note="Section templates, the timeline calendar and the deadline tracker."
      actions={
        <>
          <Button onClick={() => setAddingTodo(true)}><Plus className="w-3.5 h-3.5" /> Deadline</Button>
          {leads && <Button tone="ghost" onClick={() => setAddingEvent(true)}><Plus className="w-3.5 h-3.5" /> Timeline event</Button>}
        </>
      }
    >
      <Panel title="Section documents">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {state.quickLinks.map((link) => (
            <div key={link.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2.5">
              <span className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-brand-maroon dark:text-brand-maroon-light shrink-0" />
                <span className="text-[11px] sm:text-xs font-bold text-gray-800 dark:text-neutral-200 truncate">{link.label}</span>
              </span>
              {link.url ? (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 py-1 rounded-lg bg-brand-maroon hover:bg-brand-maroon-dark text-white text-[10px] font-bold flex items-center gap-1 shrink-0"
                >
                  Open <ExternalLink className="w-2.5 h-2.5" />
                </a>
              ) : (
                <span className="text-[10px] text-gray-400 dark:text-neutral-500 italic shrink-0">Not linked yet</span>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-gray-200 dark:border-neutral-700 p-2.5 sm:col-span-2">
            <span className="text-[11px] text-gray-500 dark:text-neutral-400">
              4LO requests land in the Layout desk — a finished article becomes an online pub task there.
            </span>
            <a href={MKULAYOUT_URL} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-brand-maroon dark:text-brand-maroon-light flex items-center gap-1 shrink-0">
              MKuLayout <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        {state.quickLinks.some((l) => !l.url) && leads && (
          <p className="text-[10px] text-gray-400 dark:text-neutral-500">Add the missing URLs under Settings.</p>
        )}
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Calendar state={state} monthOffset={monthOffset} onShift={setMonthOffset} />

        <div className="space-y-4">
          <Panel title="Timeline" right={leads && <Button tone="ghost" onClick={() => setAddingEvent(true)}><Plus className="w-3 h-3" /> Event</Button>}>
            {upcoming.length === 0 ? <Empty text="Nothing scheduled ahead." /> : (
              <ul className="space-y-1.5">
                {upcoming.map((e) => {
                  const kind = EVENT_KINDS.find((k) => k.key === e.kind) || EVENT_KINDS[0];
                  return (
                    <li key={e.id} className="flex items-start justify-between gap-2 text-[11px] sm:text-xs">
                      <span className="min-w-0">
                        <span className="font-bold text-gray-900 dark:text-neutral-100">{e.title}</span>
                        <span className="block text-[10px] text-gray-500 dark:text-neutral-400">
                          {new Date(`${e.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                          {e.notes ? ` · ${e.notes}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0">
                        <Pill tone={kind.tone}>{kind.label}</Pill>
                        {leads && (
                          <button
                            onClick={() => mutate((draft) => { draft.events = draft.events.filter((x) => x.id !== e.id); })}
                            className="p-1 rounded-lg text-gray-400 hover:text-rose-600 cursor-pointer"
                            aria-label={`Remove ${e.title}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="To-do deadlines"
            right={
              leads && (
                <Button tone={showAllTodos ? "primary" : "ghost"} onClick={() => setShowAllTodos(!showAllTodos)}>
                  {showAllTodos ? "Whole section" : "Mine"}
                </Button>
              )
            }
          >
            {todos.length === 0 ? <Empty text="No deadlines tracked. Add one so nothing slips." /> : (
              <ul className="space-y-1.5">
                {todos.map((t) => {
                  const overdue = !t.done && t.due < iso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                  return (
                    <li key={t.id} className={`flex items-center gap-2 rounded-xl border p-2 text-[11px] sm:text-xs ${
                      t.done
                        ? "border-gray-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 opacity-60"
                        : overdue
                          ? "border-red-300 dark:border-red-700 bg-red-50/80 dark:bg-red-950/30"
                          : "border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900"
                    }`}>
                      <button
                        onClick={() => mutate((draft) => { draft.todos = draft.todos.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)); })}
                        className="p-0.5 rounded text-brand-maroon dark:text-brand-maroon-light cursor-pointer shrink-0"
                        aria-label={t.done ? `Reopen ${t.title}` : `Complete ${t.title}`}
                      >
                        <CheckSquare className={`w-4 h-4 ${t.done ? "opacity-40" : ""}`} />
                      </button>
                      <span className={`min-w-0 flex-1 truncate font-semibold text-gray-800 dark:text-neutral-200 ${t.done ? "line-through" : ""}`}>{t.title}</span>
                      {(leads && showAllTodos) && <span className="text-[10px] text-gray-500 dark:text-neutral-400 shrink-0">{nameOf(state, t.ownerEmail)}</span>}
                      <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-neutral-400 shrink-0">
                        <CalendarDays className="w-3 h-3" />
                        {t.due ? new Date(`${t.due}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "no date"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {addingEvent && <EventModal onClose={() => setAddingEvent(false)} />}
      {addingTodo && <TodoModal viewer={viewer} state={state} onClose={() => setAddingTodo(false)} />}
    </Desk>
  );
}
