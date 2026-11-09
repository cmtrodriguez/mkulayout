// localStorage-backed store for MKule News.
//
// There is deliberately no server here yet: MKule News must not touch the MKuLayout
// Supabase project (its schema and data belong to the layout tool). Everything the desk
// does runs against one JSON document per browser, and the shape is small enough that
// swapping in a hosted backend later is a change to this file only — components talk to
// `mutate`/`useNews` and never to localStorage.
import { useSyncExternalStore } from "react";
import {
  Account, ArtxTask, Assessment, NewsContacts, NewsNotification, Pitch, QuickLink,
  SEED_ACCOUNTS, SEED_CONTACTS, SEED_QUICK_LINKS, ShortformEntry, StageEvent, TaskComment,
  TimelineEvent, Todo, WeeklyAvailability, DAYS,
} from "../types";

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

function read(): NewsState {
  if (typeof localStorage === "undefined") return seedState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<NewsState>;
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
  } catch {
    return seedState();
  }
}

let state: NewsState = read();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // A full or blocked localStorage must not take the desk down; the in-memory state
    // still works for the session and the banner tells the member nothing was saved.
    console.warn("MKule News could not save locally:", err);
  }
}

export function getState(): NewsState {
  return state;
}

export function mutate(recipe: (draft: NewsState) => void) {
  const next = { ...state };
  recipe(next);
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function useNews(): NewsState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    getState,
    getState
  );
}

/** Another tab wrote the desk; re-read so both tabs show the same board. */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    state = read();
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

export function upsertAssessment(draft: NewsState, entry: Omit<Assessment, "id" | "updatedAt">) {
  const now = new Date().toISOString();
  const existing = draft.assessments.find(
    (a) => a.kind === entry.kind && a.period === entry.period && a.subjectEmail === entry.subjectEmail && a.raterEmail === entry.raterEmail
  );
  if (existing) {
    draft.assessments = draft.assessments.map((a) => (a.id === existing.id ? { ...a, ...entry, updatedAt: now } : a));
  } else {
    draft.assessments = [...draft.assessments, { id: newId("asmt"), updatedAt: now, ...entry }];
  }
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

export function resetDesk() {
  state = seedState();
  persist();
  listeners.forEach((l) => l());
}

export type { QuickLink };
