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

function toCsvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function getLinkValue(link?: string): string {
  if (!link) return "";
  return extractHyperlinkDetails(link).url || link;
}

export function buildReleaseTrackerCsv(tasks: Task[]): string {
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

  const sheetRows = [
    ["RELEASES TRACKER (1st SEMESTER)"],
    ["OTHER ONLINE RELEASES"],
    RELEASE_TRACKER_COLUMNS,
    ...releaseRows,
  ];
  return `\uFEFF${sheetRows.map((row) => row.map(toCsvCell).join(",")).join("\r\n")}`;
}