const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

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
  const monthDayYear = trimmed.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (monthDayYear) {
    const month = MONTH_NAMES.findIndex((name) => name === monthDayYear[1].toLowerCase() || name.slice(0, 3) === monthDayYear[1].toLowerCase());
    const year = Number(monthDayYear[3]);
    const day = Number(monthDayYear[2]);
    if (month !== -1 && day >= 1 && day <= new Date(year, month + 1, 0).getDate()) {
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const currentYear = new Date().getFullYear();
  const parsed = new Date(`${trimmed} ${currentYear}`);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
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
