import { TaskPriority } from "../types";

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const monthIndex = (token: string): number => {
  const lower = token.toLowerCase();
  return MONTH_NAMES.findIndex((name) => name === lower || name.slice(0, 3) === lower);
};

const pad2 = (value: number): string => String(value).padStart(2, "0");

// Normalizes the releaseDate labels used across the app into "YYYY-MM-DD" so
// they can drive <input type="date">. Labels arrive as "OCTOBER 3, 2026",
// "2026-10-03" or a bare "OCTOBER 3"; anything without a real date (an
// issue-sheet page number, "Issue Board") yields "".
export function toISOFormatDate(dateStr: string): string {
  if (!dateStr) return "";
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  // A month name plus a day, with an optional year and an optional day range
  // ("OCTOBER 3", "OCTOBER 3, 2026", "OCTOBER 3-4"). Anything else is left
  // unparseable on purpose: handing labels to Date() directly turned "Issue
  // Board" into January 1 and page ranges into spring dates, which made every
  // undated task look past due.
  const monthDay = trimmed.match(/^([a-z]+)\s+(\d{1,2})(?:\s*[-–]\s*\d{1,2})?(?:,?\s+(\d{4}))?$/i);
  if (monthDay) {
    const month = monthIndex(monthDay[1]);
    const year = monthDay[3] ? Number(monthDay[3]) : new Date().getFullYear();
    const day = Number(monthDay[2]);
    if (month !== -1 && day >= 1 && day <= new Date(year, month + 1, 0).getDate()) {
      return `${year}-${pad2(month + 1)}-${pad2(day)}`;
    }
  }
  return "";
}

// Sortable timestamp for a task's release date, or NaN when the label holds no
// real date. NaN lets callers push undated rows to the end instead of letting
// them scatter through a dated list.
export function releaseDateTimestamp(task: { releaseDate?: string | null; lastUpdated?: string | null }): number {
  const raw = String(task.releaseDate || "").trim();
  if (!raw) return NaN;

  // A bare "OCTOBER 3" carries no year. Borrow it from lastUpdated rather than
  // assuming the current year, so a December task still outranks a January one
  // across a year boundary.
  const updated = new Date(String(task.lastUpdated || ""));
  const source = /\d{4}/.test(raw) || isNaN(updated.getTime())
    ? raw
    : `${raw} ${updated.getUTCFullYear()}`;

  const iso = toISOFormatDate(source);
  return iso ? Date.parse(iso) : NaN;
}

// Newest first. Rows whose release date is undatable sort last, keeping their
// relative order.
export function byReleaseDateDesc<T extends { releaseDate?: string | null; lastUpdated?: string | null }>(a: T, b: T): number {
  const dateA = releaseDateTimestamp(a);
  const dateB = releaseDateTimestamp(b);
  if (isNaN(dateA) || isNaN(dateB)) {
    return isNaN(dateA) === isNaN(dateB) ? 0 : isNaN(dateA) ? 1 : -1;
  }
  return dateB - dateA;
}

// Readable posting date for a card, e.g. "October 20, 2026". Labels that hold no
// real date (an issue-sheet page number, "Issue Board") return "" so a card can
// leave the line out instead of printing the placeholder as if it were a date.
export function releaseDateLabel(task: { releaseDate?: string | null; lastUpdated?: string | null }): string {
  const stamp = releaseDateTimestamp(task);
  if (isNaN(stamp)) return "";
  const parsed = new Date(stamp);
  const month = MONTH_NAMES[parsed.getUTCMonth()];
  return `${month[0].toUpperCase()}${month.slice(1)} ${parsed.getUTCDate()}, ${parsed.getUTCFullYear()}`;
}

// True when the release-date label resolves to a calendar date strictly
// before today. Labels with no real date (page numbers, "Issue Board") are
// never past due.
export function isPastDue(dateStr?: string | null): boolean {
  const iso = dateStr ? toISOFormatDate(dateStr) : "";
  if (!iso) return false;
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return iso < todayISO;
}

// Today as "YYYY-MM-DD" in the viewer's own calendar, which is what a date
// input compares against. toISOString() is avoided because it reports UTC and
// would let the day before today be picked late in the evening.
export function todayISODate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const SETTLED_PROGRESS = ["Completed", "Approved", "Archived", "Shelved"];

// Priority follows the deadline instead of the value chosen when the task was
// made, so a piece reads as Urgent on the day it is due without anyone editing
// it. Settled work keeps the label it finished with, and a release label that
// holds no real date (an issue-sheet page number, "Issue Board") keeps its
// stored priority rather than reading as overdue forever.
export function effectiveTaskPriority(task: {
  priority?: TaskPriority | "" | null;
  releaseDate?: string | null;
  progress?: string | null;
}): TaskPriority {
  if (task.progress && SETTLED_PROGRESS.includes(task.progress)) {
    return (task.priority as TaskPriority) || "Medium";
  }
  const iso = task.releaseDate ? toISOFormatDate(task.releaseDate) : "";
  return (iso ? computePriorityFromISO(iso) : undefined) || (task.priority as TaskPriority) || "Medium";
}

// Deadline-driven priority, same rule as the assignment creation form:
// same day = Urgent, 1-2 days = High, 3-5 days = Medium, beyond = Low.
export function computePriorityFromISO(isoDate: string): TaskPriority {
  const parts = (isoDate || "").split("-");
  if (parts.length !== 3) return "Medium";
  const target = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays <= 0) return "Urgent";
  if (diffDays <= 2) return "High";
  if (diffDays <= 5) return "Medium";
  return "Low";
}
