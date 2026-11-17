/** Small formatting helpers shared by the SecMeets desk and the PDF export, kept
    out of secMeetPdf.ts so the desk does not pull jsPDF into the main bundle. */

const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ordinalOf(seq: number): string {
  const isTeen = Math.floor(seq / 10) % 10 === 1;
  if (!isTeen) {
    if (seq % 10 === 1) return `${seq}st`;
    if (seq % 10 === 2) return `${seq}nd`;
    if (seq % 10 === 3) return `${seq}rd`;
  }
  return `${seq}th`;
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
