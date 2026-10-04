import ExcelJS from "exceljs";
import type { Task } from "../types";
import { extractHyperlinkDetails } from "./canvaTemplates";

const RELEASE_TRACKER_COLUMNS = [
  "SECTION",
  "TITLE",
  "LAYOUT ARTIST (PRINT)",
  "LAYOUT ARTIST (ONLINE)",
  "ILLUSTRATOR",
  "POSTING DATE",
  "CAPTION",
  "ARTX LINK",
  "PUB LINK",
  "STATUS",
];

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

  const releaseRows: string[][] = printTasks.map((printTask) => {
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

    return [
      sourceTask.typeOfContent,
      baseTitle,
      printTask.illusLayout,
      onlineTask?.illusLayout || "",
      illustrators,
      onlineTask?.releaseDate || printTask.releaseDate,
      onlineTask?.writeup || printTask.writeup,
      getLinkValue(onlineTask?.draftLink || printTask.draftLink || onlineTask?.addedToLayout || printTask.addedToLayout),
      getLinkValue(onlineTask?.pubmatLink || printTask.pubmatLink),
      onlineTask?.progress || printTask.progress,
    ];
  });

  onlineTasks.filter((task) => !matchedOnlineIds.has(task.id)).forEach((task) => {
    releaseRows.push([
      task.typeOfContent,
      getBaseTitle(task.title),
      "",
      task.illusLayout,
      task.graphicsIllus || task.graphics || "",
      task.releaseDate,
      task.writeup,
      getLinkValue(task.draftLink || task.addedToLayout),
      getLinkValue(task.pubmatLink),
      task.progress,
    ]);
  });

  return releaseRows;
}

export async function buildReleaseTrackerWorkbook(tasks: Task[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MKuLayout";
  workbook.subject = "First semester releases tracker";
  workbook.title = "Releases Tracker (1st Semester)";

  const sheet = workbook.addWorksheet("Releases Tracker", {
    properties: { defaultRowHeight: 19 },
    views: [{ state: "frozen", ySplit: 3 }],
  });
  sheet.columns = [
    { width: 23 },
    { width: 34 },
    { width: 28 },
    { width: 28 },
    { width: 24 },
    { width: 16 },
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

  const subtitleRow = sheet.addRow(["OTHER ONLINE RELEASES"]);
  subtitleRow.height = 34;
  for (let column = 1; column <= RELEASE_TRACKER_COLUMNS.length; column += 1) {
    subtitleRow.getCell(column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF920000" } };
  }
  subtitleRow.getCell(1).font = { name: "Arial", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  subtitleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  sheet.mergeCells(2, 1, 2, RELEASE_TRACKER_COLUMNS.length);

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