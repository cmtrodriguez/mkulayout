// The desk's state, and the queue that keeps it in step with the shared board.
//
// Components talk to `mutate`/`useNews` and never to a transport. Without Supabase
// configured, `mutate` writes straight through to localStorage as it always did. With it
// configured, a mutation is remembered as a recipe and the visible state is derived from
// `base + queue`: that is what lets a rejected write be replayed over someone else's
// newer document instead of rolling straight over their head.
import { useSyncExternalStore } from "react";
import {
  Account, ArtxTask, Assessment, NewsContacts, NewsNotification, Pitch, QuickLink,
  SEED_ACCOUNTS, SEED_CONTACTS, SEED_QUICK_LINKS, ShortformEntry, StageEvent, TaskComment,
  TimelineEvent, Todo, WeeklyAvailability, DAYS,
} from "../types";
import { BoardRow, fetchBoard, loadAssessments, pushBoard, subscribeBoard } from "./cloud";
import { CLOUD_ENABLED } from "./supabase";

export const STORAGE_KEY = "mkule-news:state:v1";

export interface NewsState {
  accounts: Account[];
  tasks: ArtxTask[];
  comments: TaskComment[];
  notifications: NewsNotification[];
  pitches: Pitch[];
  shortform: ShortformEntry[];
  availability: WeeklyAvailability[];
  todos: Todo[];
  events: TimelineEvent[];
  assessments: Assessment[];
  quickLinks: QuickLink[];
  contacts: NewsContacts;
}

export function newId(prefix = "id"): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

function emptyAvailability(email: string): WeeklyAvailability {
  const days: Record<string, string[]> = {};
  DAYS.forEach((d) => { days[d] = []; });
  return { email, days, unavailableDays: [] };
}

export function seedState(): NewsState {
  return {
    accounts: SEED_ACCOUNTS.map((a) => ({ ...a })),
    tasks: [],
    comments: [],
    notifications: [],
    pitches: [],
    shortform: [],
    availability: SEED_ACCOUNTS.map((a) => emptyAvailability(a.email)),
    todos: [],
    events: [],
    assessments: [],
    quickLinks: SEED_QUICK_LINKS.map((l) => ({ ...l })),
    contacts: { ...SEED_CONTACTS },
  };
}

function hydrate(parsed: Partial<NewsState>): NewsState {
  const base = seedState();
  // Merging the seed back in keeps newly added accounts and links visible after an
  // app update, without discarding anything the desk already recorded.
  const knownEmails = new Set((parsed.accounts || []).map((a) => a.email));
  return {
    ...base,
    ...parsed,
    accounts: [...(parsed.accounts || []), ...SEED_ACCOUNTS.filter((a) => !knownEmails.has(a.email))],
    quickLinks: parsed.quickLinks?.length ? parsed.quickLinks : base.quickLinks,
    contacts: { ...SEED_CONTACTS, ...(parsed.contacts || {}) },
    tasks: parsed.tasks || [],
    comments: parsed.comments || [],
    notifications: parsed.notifications || [],
    pitches: parsed.pitches || [],
    shortform: parsed.shortform || [],
    availability: parsed.availability || base.availability,
    todos: parsed.todos || [],
    events: parsed.events || [],
    assessments: parsed.assessments || [],
  };
}

function read(): NewsState {
  if (typeof localStorage === "undefined") return seedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    return hydrate(JSON.parse(raw) as Partial<NewsState>);
  } catch {
    return seedState();
  }
}

type Recipe = (draft: NewsState) => void;

/** The last state this tab knows the cloud accepted (or, offline, the state on disk). */
let base: NewsState = read();
let state: NewsState = base;
/** Recipes applied locally but not yet confirmed written. Replayed after a rejected push. */
const queue: Recipe[] = [];

let remoteRev: number | null = null;
let busy = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let actorEmail = "";
let unsubscribeRealtime: (() => void) | null = null;

const listeners = new Set<() => void>();
function notify() { listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export interface SyncInfo {
  mode: "local" | "loading" | "saving" | "saved" | "error";
  error: string;
  lastWrittenBy: string;
  pending: number;
}

let sync: SyncInfo = { mode: CLOUD_ENABLED ? "loading" : "local", error: "", lastWrittenBy: "", pending: 0 };
function setSync(patch: Partial<SyncInfo>) {
  sync = { ...sync, pending: queue.length, ...patch };
}

export function getSync(): SyncInfo { return sync; }
export function useSync(): SyncInfo {
  return useSyncExternalStore(subscribe, getSync, getSync);
}

/** Who is writing, recorded on the row so the banner can name the last editor. */
export function setActor(email: string) { actorEmail = email; }

function persistLocal(doc: NewsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch (err) {
    // A full or blocked localStorage must not take the desk down; the in-memory state
    // still works for the session and the banner tells the member nothing was saved.
    console.warn("MKule News could not save locally:", err);
  }
}

/** state = the confirmed document with every unconfirmed recipe replayed on top.
    Cloned first so a replay cannot append the same history entry twice. */
function derive() {
  const next: NewsState = CLOUD_ENABLED ? JSON.parse(JSON.stringify(base)) : { ...base };
  for (const r of queue) r(next);
  state = next;
  persistLocal(next);
}

function adopt(row: BoardRow | null) {
  const mine = state.assessments;
  base = hydrate(row ? row.doc : {});
  // The shared document never carries assessments; the viewer keeps the private list
  // row-level security handed them from.
  base.assessments = mine;
  remoteRev = row ? row.rev : null;
  setSync({ lastWrittenBy: row?.updatedBy || "" });
  derive();
}

export async function push(): Promise<void> {
  if (!CLOUD_ENABLED || busy || !queue.length) return;
  busy = true;
  clearTimeout(timer);
  try {
    for (let attempt = 0; attempt < 3 && queue.length; attempt++) {
      const snapshot = state;
      const res = await pushBoard(snapshot, remoteRev, actorEmail);
      if (res.ok) {
        base = snapshot;
        queue.length = 0;
        remoteRev = res.rev;
        setSync({ mode: "saved", error: "", lastWrittenBy: actorEmail });
        notify();
        return;
      }
      if (res.reason === "conflict") {
        // Someone else moved the board first: take their document, re-run our pending
        // recipes on it, and try again with the new revision.
        adopt(res.row);
        setSync({ mode: "saving", error: "" });
        notify();
        continue;
      }
      setSync({ mode: "error", error: res.message });
      notify();
      return;
    }
  } finally {
    busy = false;
  }
  if (queue.length) schedule();
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => { void push(); }, 400);
}

export function getState(): NewsState {
  return state;
}

export function mutate(recipe: Recipe) {
  if (!CLOUD_ENABLED) {
    const next = { ...state };
    recipe(next);
    state = next;
    base = next;
    persistLocal(next);
    notify();
    return;
  }
  queue.push(recipe);
  derive();
  setSync({ mode: "saving", error: "" });
  notify();
  schedule();
}

export function useNews(): NewsState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** Bring the shared board down, then follow it. Call once the session is live, because
    row-level security answers differently before and after sign-in. */
export async function connectCloud(): Promise<void> {
  if (!CLOUD_ENABLED || unsubscribeRealtime) return;
  setSync({ mode: "loading", error: "" });
  notify();
  try {
    const row = await fetchBoard();
    if (row) {
      adopt(row);
    } else {
      // The first member to open the desk seeds the shared document.
      const res = await pushBoard(base, null, actorEmail);
      if (res.ok) remoteRev = res.rev;
      else setSync({ mode: "error", error: res.reason === "error" ? res.message : "Could not read the board." });
    }
    const assessments = await loadAssessments();
    base = { ...base, assessments };
    derive();
    setSync({ mode: queue.length ? "saving" : "saved", error: "" });
    unsubscribeRealtime = subscribeBoard((r) => {
      // Our own writes come back on the same channel, and an event ordered before a
      // confirmed push carries an older document; only ever move forward.
      if (remoteRev !== null && r.rev <= remoteRev) return;
      adopt(r);
      notify();
      if (queue.length) schedule();
    });
  } catch (err) {
    setSync({ mode: "error", error: err instanceof Error ? err.message : "Could not reach Supabase." });
  }
  notify();
}

/** Another tab wrote the desk. Offline that is the only sync path; with a backend the
    realtime subscription already covers it, and adopting from disk would fight the queue. */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY || CLOUD_ENABLED) return;
    state = read();
    base = state;
    listeners.forEach((l) => l());
  });
}

// ---------------------------------------------------------------------------
// Common record helpers
// ---------------------------------------------------------------------------

export function pushNotification(
  draft: NewsState,
  n: Omit<NewsNotification, "id" | "timestamp" | "readBy"> & { readBy?: string[] }
) {
  draft.notifications = [
    { id: newId("ntf"), timestamp: new Date().toISOString(), readBy: n.readBy || [], ...n },
    ...draft.notifications,
  ].slice(0, 300);
}

export function logStage(task: ArtxTask, event: StageEvent) {
  task.history = [...(task.history || []), event];
  task.updatedAt = event.at;
}

export function touchTask(draft: NewsState, id: string, patch: Partial<ArtxTask>, event?: StageEvent) {
  draft.tasks = draft.tasks.map((t) => {
    if (t.id !== id) return t;
    const next = { ...t, ...patch, updatedAt: new Date().toISOString() };
    if (event) logStage(next, event);
    return next;
  });
}

export function addComment(draft: NewsState, comment: Omit<TaskComment, "id" | "timestamp">) {
  draft.comments = [
    ...draft.comments,
    { id: newId("cmt"), timestamp: new Date().toISOString(), ...comment },
  ];
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function accountByEmail(state: NewsState, email?: string | null): Account | undefined {
  if (!email) return undefined;
  const wanted = email.trim().toLowerCase();
  return state.accounts.find((a) => a.email.toLowerCase() === wanted);
}

export function nameOf(state: NewsState, email?: string): string {
  return accountByEmail(state, email)?.name || email || "Unassigned";
}

export function availabilityFor(state: NewsState, email: string): WeeklyAvailability {
  return state.availability.find((a) => a.email === email) || emptyAvailability(email);
}

export function setAvailability(draft: NewsState, next: WeeklyAvailability) {
  const rest = draft.availability.filter((a) => a.email !== next.email);
  draft.availability = [...rest, { ...next, lastUpdated: new Date().toISOString() }];
}

/** The roster ships with placeholder addresses, so the very first real Google account to
    open the desk takes the Editor-In-Chief seat and can then map everybody else in
    Settings. Once any address is confirmed this stops happening. */
export function claimFoundingEditor(email: string, name: string): boolean {
  if (accountByEmail(state, email)) return false;
  if (state.accounts.some((a) => a.emailConfirmed)) return false;
  mutate((draft) => {
    draft.accounts = draft.accounts.map((a) => (a.role === "Editor-In-Chief"
      ? { ...a, email, name: name || email, emailConfirmed: true }
      : a));
  });
  return true;
}

export async function resetDesk(): Promise<void> {
  if (!CLOUD_ENABLED) {
    base = seedState();
    state = base;
    persistLocal(state);
    notify();
    return;
  }
  // Never send a seeded document over a board the section is using: with a backend this
  // button drops the browser's unsent edits and re-reads what everyone else sees.
  queue.length = 0;
  unsubscribeRealtime?.();
  unsubscribeRealtime = null;
  remoteRev = null;
  setSync({ mode: "loading", error: "" });
  notify();
  await connectCloud();
  notify();
}

export type { QuickLink };
