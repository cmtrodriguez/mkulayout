import ExcelJS from "exceljs";
import type { Task } from "../types";
import { extractHyperlinkDetails } from "./canvaTemplates";
import { byReleaseDateDesc, releaseDateTimestamp } from "./taskDate";

const RELEASE_TRACKER_COLUMNS = [
  "SECTION",
  "TITLE",
  "TYPE",
  "LAYOUT ARTIST (PRINT)",
  "LAYOUT ARTIST (ONLINE)",
  "ILLUSTRATOR",
  "POSTING DATE",
  "CAPTION",
  "ARTX LINK",
  "PUB LINK",
  "STATUS",
];

const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

// POSTING DATE cells must read "MONTH DAY, YEAR" (e.g. "OCTOBER 27, 2026").
// Labels like a bare "OCTOBER 20" get their year from lastUpdated; cells with
// no real date (an issue-sheet page number, "Issue Board") stay as-is.
function formatPostingDate(task: Task): string {
  const timestamp = releaseDateTimestamp(task);
  if (isNaN(timestamp)) return task.releaseDate || "";
  const date = new Date(timestamp);
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

const isPrintIssue = (task: Task) => task.typeOfRelease === "Issue Article" || task.typeOfRelease === "Newspaper Issue";
const isOnlineRelease = (task: Task) => task.typeOfRelease.toLowerCase().includes("online") || /\(online pubmat\)$/i.test(task.title);
const getBaseTitle = (title: string) => title.replace(/\s*\(online pubmat\)$/i, "").trim();

function getLinkValue(link?: string): string {
  if (!link) return "";
  return extractHyperlinkDetails(link).url || link;
}

export function buildReleaseTrackerRows(tasks: Task[]): string[][] {
  const printTasks = tasks.filter(isPrintIssue);
  const onlineTasks = tasks.filter(isOnlineRelease);
  const matchedOnlineIds = new Set<string>();

  // Each row keeps the task whose releaseDate lands in the POSTING DATE cell, so
  // the sort reads exactly the value the sheet displays.
  const datedRows: { values: string[]; dateSource: Task }[] = [];

  printTasks.forEach((printTask) => {
    const baseTitle = getBaseTitle(printTask.title);
    const onlineTask = onlineTasks.find((candidate) => {
      if (matchedOnlineIds.has(candidate.id)) return false;
      if (printTask.sourceIssueRowId && candidate.sourceIssueRowId) {
        return printTask.sourceIssueRowId === candidate.sourceIssueRowId;
      }
      return getBaseTitle(candidate.title).toLowerCase() === baseTitle.toLowerCase();
    });

    if (onlineTask) matchedOnlineIds.add(onlineTask.id);
    const sourceTask = onlineTask || printTask;
    const illustrators = Array.from(new Set([
      printTask.graphicsIllus || printTask.graphics || "",
      onlineTask?.graphicsIllus || onlineTask?.graphics || "",
    ].map((name) => name.trim()).filter(Boolean))).join(", ");

    const dateSource = onlineTask?.releaseDate ? onlineTask : printTask;
    datedRows.push({
      dateSource,
      values: [
        sourceTask.typeOfContent,
        baseTitle,
        "Issue",
        printTask.illusLayout,
        onlineTask?.illusLayout || "",
        illustrators,
        formatPostingDate(dateSource),
        onlineTask?.writeup || printTask.writeup,
        getLinkValue(onlineTask?.draftLink || printTask.draftLink || onlineTask?.addedToLayout || printTask.addedToLayout),
        getLinkValue(onlineTask?.pubmatLink || printTask.pubmatLink),
        onlineTask?.progress || printTask.progress,
      ],
    });
  });

  onlineTasks.filter((task) => !matchedOnlineIds.has(task.id)).forEach((task) => {
    datedRows.push({
      dateSource: task,
      values: [
        task.typeOfContent,
        getBaseTitle(task.title),
        "Online",
        "",
        task.illusLayout,
        task.graphicsIllus || task.graphics || "",
        formatPostingDate(task),
        task.writeup,
        getLinkValue(task.draftLink || task.addedToLayout),
        getLinkValue(task.pubmatLink),
        task.progress,
      ],
    });
  });

  // Latest posting date on top, oldest at the bottom. Rows whose POSTING DATE
  // holds no real date (an issue-sheet page number, "Issue Board") fall last.
  datedRows.sort((a, b) => byReleaseDateDesc(a.dateSource, b.dateSource));

  return datedRows.map((row) => row.values);
}

export async function buildReleaseTrackerWorkbook(tasks: Task[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MKuLayout";
  workbook.subject = "First semester releases tracker";
  workbook.title = "Releases Tracker (1st Semester)";

  const sheet = workbook.addWorksheet("Releases Tracker", {
    properties: { defaultRowHeight: 19 },
    views: [{ state: "frozen", ySplit: 2 }],
  });
  sheet.columns = [
    { width: 23 },
    { width: 34 },
    { width: 12 },
    { width: 28 },
    { width: 28 },
    { width: 24 },
    { width: 20 },
    { width: 42 },
    { width: 34 },
    { width: 26 },
    { width: 20 },
  ];

  const titleRow = sheet.addRow(["RELEASES TRACKER (1st SEMESTER)"]);
  titleRow.height = 52;
  for (let column = 1; column <= RELEASE_TRACKER_COLUMNS.length; column += 1) {
    titleRow.getCell(column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF920000" } };
  }
  titleRow.getCell(1).font = { name: "Arial", size: 19, bold: true, color: { argb: "FFFFFFFF" } };
  titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  sheet.mergeCells(1, 1, 1, RELEASE_TRACKER_COLUMNS.length);

  const headerRow = sheet.addRow(RELEASE_TRACKER_COLUMNS);
  headerRow.height = 34;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1CCCC" } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF111111" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD8B0B0" } },
      bottom: { style: "thin", color: { argb: "FFD8B0B0" } },
      left: { style: "thin", color: { argb: "FFD8B0B0" } },
      right: { style: "thin", color: { argb: "FFD8B0B0" } },
    };
  });

  buildReleaseTrackerRows(tasks).forEach((values) => {
    const row = sheet.addRow(values);
    row.height = 18;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Arial", size: 10, color: { argb: "FF111111" } };
      cell.alignment = { vertical: "middle", wrapText: false };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9D9D9" } },
        bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
        left: { style: "thin", color: { argb: "FFD9D9D9" } },
        right: { style: "thin", color: { argb: "FFD9D9D9" } },
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer).buffer as ArrayBuffer;
}