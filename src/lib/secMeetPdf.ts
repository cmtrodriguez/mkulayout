import DOMPurify from "dompurify";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ATTENDANCE_STATES, DISPO_CATEGORIES, SecMeet, SecMeetProgress } from "../types";
import type { SecMeetRosterEntry } from "./memberUtils";
import { formatSecMeetDate, ordinalOf, romanOf } from "./secMeetFormat";
import masthead from "../masthead.png?inline";

/**
 * The export reproduces the section's official minutes template: the Collegian
 * masthead banner across the top of every page, a centred serif title and date,
 * AGENDA in roman numerals, the highlighted P/L/E/A legend, ATTENDANCE as a
 * narrow two-column table under a maroon bar, I. DISPO CHECK as a full-width
 * table whose header appears once, and II. MINUTES in lettered items that keep
 * whatever bold, italics, bullets and alignment the Editor wrote.
 */

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = PAGE_HEIGHT - MARGIN;

const MASTHEAD_HEIGHT = Math.round(PAGE_WIDTH * (102 / 512));
const TOP = MASTHEAD_HEIGHT + 28;

const MAROON: [number, number, number] = [123, 0, 0];
const LEGEND_COLORS: [number, number, number][] = [[0, 255, 0], [255, 255, 0], [0, 255, 255], [255, 0, 0]];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const BULLET = "\u2022";

const BODY_SIZE = 12;
const LINE = BODY_SIZE + 6;

const ITEM_MARK = 15;
const ITEM_TEXT = 43;
const MINUTE_MARK = 62;
const MINUTE_TEXT = 95;

const MINUTES_TAGS = ["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "div"];

interface MinutesRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface MinutesBlock {
  runs: MinutesRun[];
  align: "left" | "center" | "right";
  list: "ul" | "ol" | null;
  index: number;
}

function collectRuns(node: Node): MinutesRun[] {
  const runs: MinutesRun[] = [];
  const walk = (current: Node, bold: boolean, italic: boolean, underline: boolean) => {
    if (current.nodeType === Node.TEXT_NODE) {
      const text = (current.textContent ?? "").replace(/\s+/g, " ");
      if (text) runs.push({ text, bold, italic, underline });
      return;
    }
    if (current.nodeType !== Node.ELEMENT_NODE) return;
    const tag = (current as Element).tagName.toLowerCase();
    if (tag === "br") {
      runs.push({ text: " ", bold, italic, underline });
      return;
    }
    current.childNodes.forEach((child) => walk(
      child,
      bold || tag === "b" || tag === "strong",
      italic || tag === "i" || tag === "em",
      underline || tag === "u",
    ));
  };
  walk(node, false, false, false);
  return runs;
}

function alignOf(element: Element, root: Element): "left" | "center" | "right" {
  let node: Element | null = element;
  while (node && node !== root) {
    const align = (node as HTMLElement).style?.textAlign;
    if (align === "center") return "center";
    if (align === "right" || align === "end") return "right";
    node = node.parentElement;
  }
  return "left";
}

/** The stored minutes are the Editor's own HTML, so they are turned back into
    styled runs rather than printed as markup. Plain text left over from an
    older meeting still exports, one line per item. */
function parseMinutes(minutes: string): MinutesBlock[] {
  if (!minutes.trim()) return [];

  if (!/<[a-z]/i.test(minutes)) {
    return minutes.split(/\r?\n/).map((raw) => {
      const text = raw.trim().replace(/^\d+[.)]\s*/, "");
      return {
        runs: text ? [{ text, bold: false, italic: false, underline: false }] : [],
        align: "left" as const,
        list: null,
        index: 0,
      };
    });
  }

  const container = document.createElement("div");
  container.innerHTML = DOMPurify.sanitize(minutes, { ALLOWED_TAGS: MINUTES_TAGS, ALLOWED_ATTR: ["style"] });

  const blocks: MinutesBlock[] = [];
  let buffer: MinutesRun[] = [];
  const flush = () => {
    if (buffer.map((run) => run.text).join("").trim()) {
      blocks.push({ runs: buffer, align: "left", list: null, index: 0 });
    }
    buffer = [];
  };

  container.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ");
      if (text) buffer.push({ text, bold: false, italic: false, underline: false });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    const tag = element.tagName.toLowerCase();

    if (tag === "br") {
      flush();
      return;
    }
    if (tag === "ul" || tag === "ol") {
      flush();
      let index = 0;
      Array.from(element.children).forEach((child) => {
        if (child.tagName.toLowerCase() !== "li") return;
        index += 1;
        blocks.push({ runs: collectRuns(child), align: alignOf(child, container), list: tag as "ul" | "ol", index });
      });
      return;
    }
    if (tag === "p" || tag === "div") {
      flush();
      blocks.push({ runs: collectRuns(element), align: alignOf(element, container), list: null, index: 0 });
      return;
    }
    buffer.push(...collectRuns(element));
  });
  flush();
  return blocks;
}

export async function exportSecMeetPdf(input: {
  meeting: SecMeet;
  roster: SecMeetRosterEntry[];
  progress: SecMeetProgress[];
  viewerIsLead: boolean;
}): Promise<void> {
  const { meeting, roster, progress, viewerIsLead } = input;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = TOP + 25;

  // The banner belongs to the template on every page, including the pages a
  // table opens by itself, so it is drawn once per page number and never twice.
  const mastheadPages = new Set<number>();
  const drawMasthead = (pageNumber: number) => {
    if (mastheadPages.has(pageNumber)) return;
    mastheadPages.add(pageNumber);
    const current = doc.getNumberOfPages();
    doc.setPage(pageNumber);
    doc.addImage(masthead, "PNG", 0, 0, PAGE_WIDTH, MASTHEAD_HEIGHT);
    doc.setPage(current);
  };
  drawMasthead(1);

  const newPage = () => {
    doc.addPage();
    drawMasthead(doc.getNumberOfPages());
    y = TOP;
  };

  const breakFor = (needed: number) => {
    if (y + needed > BOTTOM) newPage();
  };

  const setFont = (bold: boolean, italic: boolean, size = BODY_SIZE) => {
    doc.setFont("times", bold && italic ? "bolditalic" : bold ? "bold" : italic ? "italic" : "normal");
    doc.setFontSize(size);
  };

  const widthOf = (word: MinutesRun) => {
    setFont(word.bold, word.italic);
    return doc.getTextWidth(word.text);
  };

  const spacer = (points: number) => {
    breakFor(points);
    y += points;
  };

  const writeCentred = (text: string, size: number, bold: boolean) => {
    breakFor(size + 6);
    setFont(bold, false, size);
    doc.text(text, PAGE_WIDTH / 2, y, { align: "center" });
    y += size + 6;
  };

  /** Words keep their own styles, so a wrapped line is redrawn word by word. */
  const wrapRuns = (runs: MinutesRun[], maxWidth: number): MinutesRun[][] => {
    const words: MinutesRun[] = [];
    runs.forEach((run) => {
      run.text.split(/(\s+)/).forEach((piece) => {
        if (piece) words.push({ ...run, text: piece });
      });
    });

    const lines: MinutesRun[][] = [];
    let current: MinutesRun[] = [];
    let width = 0;
    words.forEach((word) => {
      const isSpace = /^\s+$/.test(word.text);
      if (isSpace && current.length === 0) return;
      const wordWidth = widthOf(word);
      if (current.length > 0 && width + wordWidth > maxWidth) {
        lines.push(current);
        current = [];
        width = 0;
        if (isSpace) return;
      }
      current.push(word);
      width += wordWidth;
    });
    if (current.length > 0) lines.push(current);

    return lines
      .map((line) => {
        const trimmed = [...line];
        while (trimmed.length > 0 && /^\s+$/.test(trimmed[trimmed.length - 1].text)) trimmed.pop();
        return trimmed;
      })
      .filter((line) => line.length > 0);
  };

  const drawLine = (line: MinutesRun[], maxWidth: number, startX: number, align: "left" | "center" | "right") => {
    let total = 0;
    line.forEach((word) => { total += widthOf(word); });
    let x = startX + (align === "center" ? (maxWidth - total) / 2 : align === "right" ? maxWidth - total : 0);
    line.forEach((word) => {
      const wordWidth = widthOf(word);
      setFont(word.bold, word.italic);
      doc.text(word.text, x, y);
      if (word.underline && word.text.trim()) {
        doc.setLineWidth(0.7);
        doc.setDrawColor(0, 0, 0);
        doc.line(x, y + 2.5, x + wordWidth, y + 2.5);
      }
      x += wordWidth;
    });
  };

  /** The template hangs the text of a numbered point under its first word. */
  const writeMarked = (
    marker: string,
    runs: MinutesRun[],
    markIndent: number,
    textIndent: number,
    align: "left" | "center" | "right",
  ) => {
    const maxWidth = CONTENT_WIDTH - textIndent;
    const lines = wrapRuns(runs, maxWidth);
    if (lines.length === 0) return;
    lines.forEach((line, index) => {
      breakFor(LINE);
      if (index === 0) {
        if (marker === BULLET) {
          // Drawn rather than typed: the bullet glyph is dropped by the standard
          // Times encoding, which would leave the item with no mark at all.
          doc.setFillColor(0, 0, 0);
          doc.circle(MARGIN + markIndent + 3, y - 3.5, 1.8, "F");
        } else {
          setFont(true, false);
          doc.text(marker, MARGIN + markIndent, y);
        }
      }
      drawLine(line, maxWidth, MARGIN + textIndent, align);
      y += LINE;
    });
  };

  const writeHeading = (marker: string, text: string) => {
    breakFor(LINE + 4);
    setFont(true, false);
    doc.text(marker, MARGIN + ITEM_MARK, y);
    doc.text(text, MARGIN + ITEM_TEXT, y);
    y += LINE + 4;
  };

  // --- Title block --------------------------------------------------------
  writeCentred(`${ordinalOf(meeting.seq)} Layout SecMeet`, 15, true);
  spacer(4);
  const dateLine = formatSecMeetDate(meeting.meetingDate);
  if (dateLine) writeCentred(dateLine, BODY_SIZE, false);
  if (meeting.details.trim()) {
    spacer(2);
    writeCentred(meeting.details.trim(), BODY_SIZE, false);
  }
  spacer(16);

  // --- AGENDA -------------------------------------------------------------
  breakFor(LINE);
  setFont(true, false);
  doc.text("AGENDA:", MARGIN, y);
  y += LINE + 4;
  meeting.agenda.forEach((item, index) => {
    writeMarked(
      `${romanOf(index + 1)}.`,
      [{ text: item.title, bold: false, italic: false, underline: false }],
      ITEM_MARK,
      ITEM_TEXT,
      "left",
    );
  });
  spacer(20);

  // --- Attendance legend --------------------------------------------------
  breakFor(LINE + 8);
  setFont(false, false, BODY_SIZE - 1);
  const slot = CONTENT_WIDTH / ATTENDANCE_STATES.length;
  ATTENDANCE_STATES.forEach((state, index) => {
    const label = `${state.value} = ${state.meaning}`;
    const width = doc.getTextWidth(label);
    const centre = MARGIN + slot * index + slot / 2;
    doc.setFillColor(...(LEGEND_COLORS[index] ?? ([255, 255, 255] as [number, number, number])));
    doc.rect(centre - width / 2 - 4, y - 11, width + 8, 16, "F");
    doc.setTextColor(0, 0, 0);
    doc.text(label, centre, y, { align: "center" });
  });
  y += LINE + 10;

  // --- ATTENDANCE ---------------------------------------------------------
  // Drawn by hand rather than with autoTable: the template merges the caption
  // across both columns, keeps the table narrow and gives the status letter a
  // thin column of its own.
  const TABLE_WIDTH = 336;
  const STATUS_COLUMN = 28;
  const ROW_HEIGHT = 20;
  const HEADER_HEIGHT = 22;

  const strokeSegment = (top: number, edges: number[], bottom: number) => {
    if (bottom <= top) return;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.8);
    doc.rect(MARGIN, top, TABLE_WIDTH, bottom - top);
    doc.setLineWidth(0.5);
    doc.line(MARGIN + TABLE_WIDTH - STATUS_COLUMN, top, MARGIN + TABLE_WIDTH - STATUS_COLUMN, bottom);
    edges.slice(0, -1).forEach((edge) => doc.line(MARGIN, edge, MARGIN + TABLE_WIDTH, edge));
  };

  breakFor(HEADER_HEIGHT + ROW_HEIGHT * 2);
  const headTop = y;
  doc.setFillColor(...MAROON);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.rect(MARGIN, headTop, TABLE_WIDTH, HEADER_HEIGHT, "FD");
  doc.setTextColor(255, 255, 255);
  setFont(true, false, BODY_SIZE);
  doc.text("ATTENDANCE", MARGIN + TABLE_WIDTH / 2, headTop + HEADER_HEIGHT / 2 + 4, { align: "center" });
  doc.setTextColor(0, 0, 0);

  let rowTop = headTop + HEADER_HEIGHT;
  let segmentTop = rowTop;
  let rowEdges: number[] = [];

  roster.forEach((entry) => {
    if (rowTop + ROW_HEIGHT > BOTTOM) {
      strokeSegment(segmentTop, rowEdges, rowTop);
      newPage();
      rowTop = y;
      segmentTop = rowTop;
      rowEdges = [];
    }
    setFont(false, false, BODY_SIZE - 1);
    doc.text(entry.officialName, MARGIN + 6, rowTop + ROW_HEIGHT / 2 + 4);
    const status = meeting.attendance[entry.email];
    if (status) {
      setFont(true, false, BODY_SIZE);
      doc.text(status, MARGIN + TABLE_WIDTH - STATUS_COLUMN / 2, rowTop + ROW_HEIGHT / 2 + 4, { align: "center" });
    }
    rowTop += ROW_HEIGHT;
    rowEdges.push(rowTop);
  });
  strokeSegment(segmentTop, rowEdges, rowTop);
  y = rowTop + 24;

  // --- I. DISPO CHECK -----------------------------------------------------
  writeHeading(`${romanOf(1)}.`, "DISPO CHECK");
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
    showHead: "firstPage",
    margin: { left: 27, right: 27, top: MASTHEAD_HEIGHT + 24, bottom: MARGIN },
    styles: { font: "times", fontSize: 10, cellPadding: 4, valign: "middle", lineColor: [0, 0, 0], lineWidth: 0.7 },
    headStyles: { fillColor: MAROON, textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 11 },
    columnStyles: {
      0: { fontStyle: "bold", halign: "center", cellWidth: 100 },
      1: { cellWidth: (558 - 100) / 4, valign: "top" },
      2: { cellWidth: (558 - 100) / 4, valign: "top" },
      3: { cellWidth: (558 - 100) / 4, valign: "top" },
      4: { cellWidth: (558 - 100) / 4, valign: "top" },
    },
    didDrawPage: (data) => drawMasthead(data.pageNumber),
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;

  // --- II. MINUTES --------------------------------------------------------
  writeHeading(`${romanOf(2)}.`, "MINUTES");
  spacer(4);

  // Every block the Editor wrote becomes one lettered item; a paragraph break
  // in the editor is kept as a gap rather than an empty letter.
  let letter = 0;
  parseMinutes(meeting.minutes).forEach((block) => {
    if (block.runs.length === 0) {
      spacer(8);
      return;
    }
    const marker = block.list === "ul"
      ? BULLET
      : block.list === "ol"
        ? `${block.index}.`
        : `${LETTERS[letter++ % LETTERS.length]}.`;
    writeMarked(marker, block.runs, MINUTE_MARK, MINUTE_TEXT, block.align);
  });

  doc.save(`Minutes - ${ordinalOf(meeting.seq)} Layout SecMeet.pdf`);
}
