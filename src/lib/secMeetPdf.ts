import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ATTENDANCE_STATES, DISPO_CATEGORIES, SecMeet, SecMeetProgress } from "../types";
import type { SecMeetRosterEntry } from "./memberUtils";
import { formatSecMeetDate, ordinalOf } from "./secMeetFormat";

/**
 * The exported minutes follow the section's official Google Docs template line
 * for line: a centred "Minutes" block, the numbered meeting, the date, AGENDA,
 * the P/L/E/A legend, ATTENDANCE, 1. DISPO CHECK as a table and 2. MINUTES.
 * Nothing is added to that structure — the only values are the ones the desk
 * holds, so a blank meeting exports as a blank form.
 */

const MARGIN = 72;
const BODY_SIZE = 11;
const LEADING = 16;

export async function exportSecMeetPdf(input: {
  meeting: SecMeet;
  roster: SecMeetRosterEntry[];
  progress: SecMeetProgress[];
  viewerIsLead: boolean;
}): Promise<void> {
  const { meeting, roster, progress, viewerIsLead } = input;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const width = doc.internal.pageSize.getWidth();
  const contentWidth = width - MARGIN * 2;
  const bottom = doc.internal.pageSize.getHeight() - MARGIN;
  let y = MARGIN;

  const breakFor = (needed: number) => {
    if (y + needed > bottom) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const writeLine = (text: string, options: { size?: number; bold?: boolean; indent?: number; align?: "left" | "center" } = {}) => {
    const size = options.size ?? BODY_SIZE;
    const indent = options.indent ?? 0;
    doc.setFont("helvetica", options.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const maxWidth = contentWidth - indent;
    const wrapped = doc.splitTextToSize(text, maxWidth) as string[];
    wrapped.forEach((piece) => {
      breakFor(size + 4);
      if (options.align === "center") {
        doc.text(piece, width / 2, y, { align: "center" });
      } else {
        doc.text(piece, MARGIN + indent, y);
      }
      y += size + 5;
    });
  };

  const spacer = (points: number) => {
    breakFor(points);
    y += points;
  };

  // The template numbers agenda items and minutes with a hanging indent, so a
  // wrapped line stays aligned under the first word instead of the number.
  const NUMBER_INDENT = 22;
  const writeNumbered = (index: number, text: string) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_SIZE);
    const wrapped = doc.splitTextToSize(text, contentWidth - NUMBER_INDENT) as string[];
    wrapped.forEach((piece, pieceIndex) => {
      breakFor(BODY_SIZE + 4);
      if (pieceIndex === 0) doc.text(`${index}.`, MARGIN, y);
      doc.text(piece, MARGIN + NUMBER_INDENT, y);
      y += BODY_SIZE + 5;
    });
  };

  // --- Header block -------------------------------------------------------
  writeLine("Minutes", { size: 14, bold: true, align: "center" });
  spacer(6);
  writeLine(`${ordinalOf(meeting.seq)} Layout SecMeet`, { size: 12, bold: true, align: "center" });
  spacer(6);
  const dateLine = formatSecMeetDate(meeting.meetingDate);
  writeLine(dateLine, { align: "center" });
  if (meeting.details.trim()) {
    spacer(2);
    writeLine(meeting.details.trim(), { align: "center" });
  }
  spacer(14);

  // --- AGENDA -------------------------------------------------------------
  writeLine("AGENDA:", { bold: true });
  spacer(4);
  meeting.agenda.forEach((item, index) => writeNumbered(index + 1, item.title));
  spacer(12);

  // --- Attendance legend --------------------------------------------------
  breakFor(LEADING);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(BODY_SIZE - 1);
  const slot = contentWidth / ATTENDANCE_STATES.length;
  ATTENDANCE_STATES.forEach((state, index) => {
    doc.text(`${state.value} = ${state.meaning}`, MARGIN + slot * index + (index === 0 ? 24 : 0), y);
  });
  y += LEADING + 4;

  // --- ATTENDANCE ---------------------------------------------------------
  writeLine("ATTENDANCE", { bold: true });
  spacer(6);
  const statusColumn = MARGIN + 320;
  roster.forEach((entry) => {
    breakFor(BODY_SIZE + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(BODY_SIZE);
    const wrapped = doc.splitTextToSize(entry.officialName, statusColumn - MARGIN - 12) as string[];
    wrapped.forEach((piece, pieceIndex) => {
      breakFor(BODY_SIZE + 6);
      doc.text(piece, MARGIN, y);
      if (pieceIndex === 0) {
        const status = meeting.attendance[entry.email];
        if (status) {
          doc.setFont("helvetica", "bold");
          doc.text(status, statusColumn, y);
          doc.setFont("helvetica", "normal");
        }
      }
      y += BODY_SIZE + 5;
    });
  });
  spacer(14);

  // --- 1. DISPO CHECK -----------------------------------------------------
  writeLine("1.  DISPO CHECK", { bold: true });
  spacer(6);

  const dispoItem = meeting.tasks.find((task) => task.itemKind === "dispo");
  const responseOf = (email: string) =>
    dispoItem ? progress.find((row) => row.itemId === dispoItem.id && row.memberEmail === email)?.dispo ?? null : null;

  breakFor(80);
  autoTable(doc, {
    startY: y,
    head: [["NAME", ...DISPO_CATEGORIES.map((category) => category.column)]],
    body: roster.map((entry) => {
      // A member's own answers stay private: only the Editor and Deputy export
      // them, and everyone else gets the blank form the template ships with.
      const responses = viewerIsLead ? responseOf(entry.email) : null;
      return [entry.surname, ...DISPO_CATEGORIES.map((category) => responses?.[category.key] ?? "")];
    }),
    theme: "grid",
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4, valign: "top", lineColor: [0, 0, 0], lineWidth: 0.5 },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: "bold", halign: "center" },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 68 },
      1: { cellWidth: (contentWidth - 68) / 4 },
      2: { cellWidth: (contentWidth - 68) / 4 },
      3: { cellWidth: (contentWidth - 68) / 4 },
      4: { cellWidth: (contentWidth - 68) / 4 },
    },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  // --- 2. MINUTES ---------------------------------------------------------
  writeLine("2.  MINUTES", { bold: true });
  spacer(4);

  // Each written line becomes a numbered item, as the template shows; a blank
  // line is kept as a paragraph gap rather than an empty number. A number the
  // writer already typed is dropped first, so a line cannot come out as "1. 1.".
  let minutesNumber = 0;
  meeting.minutes.split(/\r?\n/).forEach((raw) => {
    const text = raw.trim().replace(/^\d+[.)]\s*/, "");
    if (!text) {
      spacer(8);
      return;
    }
    minutesNumber += 1;
    writeNumbered(minutesNumber, text);
  });

  doc.save(`Minutes - ${ordinalOf(meeting.seq)} Layout SecMeet.pdf`);
}
