import { Task } from "../types";
import { MEDIUM_CANVA_LINK } from "./canvaTemplates";

const stripPubmat = (title: string) => title.replace(/\s*\(Online Pubmat\)$/i, "").trim();

const isOnline = (task: Task) =>
  task.typeOfRelease === "Online Article" || (task.title || "").includes("(Online Pubmat)");

// Only the article's content mirrors across the pair — an issue-sheet row can name a
// different person for the print layout and the online pubmat, so each card keeps its
// own assignee, status and deadline.
const MIRRORED_FIELDS: (keyof Task)[] = [
  "writer", "draftLink", "addedToLayout", "pubmatLink", "canvaLink", "mediumCanvaLink", "writeup"
];

/**
 * Applies a task edit made in the workspace and mirrors it onto the paired
 * Issue Article / Online Pubmat card, so a link added, edited or cleared on
 * either side reads the same for every account.
 */
export function applyTaskEditToPair(currentTasks: Task[], updatedTask: Task): Task[] {
  const previousTask = currentTasks.find((task) => task.id === updatedTask.id);
  const updatedList = currentTasks.map((task) => task.id === updatedTask.id ? updatedTask : task);

  if (updatedTask.typeOfRelease !== "Issue Article" && !isOnline(updatedTask)) return updatedList;

  // Mirror exactly the fields this edit changed, copied as-is. An `||` fallback would
  // revive the companion's old value and make a cleared link look like it was ignored.
  const changedFields = MIRRORED_FIELDS.filter((key) =>
    previousTask ? previousTask[key] !== updatedTask[key] : Boolean(updatedTask[key])
  );

  const baseTitle = stripPubmat(updatedTask.title || "");
  const companionIndex = updatedList.findIndex((task) =>
    task.id !== updatedTask.id &&
    task.typeOfRelease === (isOnline(updatedTask) ? "Issue Article" : "Online Article") &&
    stripPubmat(task.title || "") === baseTitle
  );

  if (companionIndex !== -1) {
    if (changedFields.length === 0) return updatedList;
    const companion = updatedList[companionIndex];
    const mirrored = { ...companion, lastUpdated: new Date().toISOString() } as Task;
    changedFields.forEach((key) => { (mirrored as any)[key] = updatedTask[key]; });
    updatedList[companionIndex] = mirrored;
    return updatedList;
  }

  if (updatedTask.typeOfRelease === "Issue Article" && updatedTask.illusLayout && updatedTask.illusLayout !== "Unassigned") {
    // Create online companion if missing — every online task must carry the medium
    // Canva link, so never inherit the issue task's (intentionally empty) one.
    const onlineTask: Task = {
      ...updatedTask,
      id: crypto.randomUUID(),
      title: `${baseTitle} (Online Pubmat)`,
      typeOfRelease: "Online Article",
      mediumCanvaLink: updatedTask.mediumCanvaLink || MEDIUM_CANVA_LINK,
      isPendingConfirmation: false
    };
    return [onlineTask, ...updatedList];
  }

  return updatedList;
}
