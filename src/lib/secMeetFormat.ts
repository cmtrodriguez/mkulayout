/** Small formatting helpers shared by the SecMeets desk and the PDF export, kept
    out of secMeetPdf.ts so the desk does not pull jsPDF into the main bundle. */

const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ROMAN: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];

export function ordinalOf(seq: number): string {
  const isTeen = Math.floor(seq / 10) % 10 === 1;
  if (!isTeen) {
    if (seq % 10 === 1) return `${seq}st`;
    if (seq % 10 === 2) return `${seq}nd`;
    if (seq % 10 === 3) return `${seq}rd`;
  }
  return `${seq}th`;
}

/** The template numbers agenda points and its two sections in roman numerals. */
export function romanOf(value: number): string {
  let rest = value;
  let out = "";
  ROMAN.forEach(([amount, symbol]) => {
    while (rest >= amount) { out += symbol; rest -= amount; }
  });
  return out;
}

/** "November 17, 2026" — the form a meeting tab shows its date in. */
export function formatSecMeetTabDate(meetingDate: string): string {
  if (!meetingDate) return "";
  const [year, month, day] = meetingDate.split("-").map((part) => Number(part));
  if (!year || !month || !day) return meetingDate;
  return `${FULL_MONTHS[month - 1]} ${String(day).padStart(2, "0")}, ${year}`;
}

/** Today as a yyyy-mm-dd string, built from local calendar parts. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "Nov. 17, 2026 (Monday)" — the minutes template's date line, empty when unset. */
export function formatSecMeetDate(meetingDate: string): string {
  if (!meetingDate) return "";
  const [year, month, day] = meetingDate.split("-").map((part) => Number(part));
  if (!year || !month || !day) return meetingDate;
  // Built from the calendar parts rather than parsed as an instant, so neither
  // the weekday nor the day number can shift by a timezone.
  const date = new Date(year, month - 1, day);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} (${WEEKDAYS[date.getDay()]})`;
}
