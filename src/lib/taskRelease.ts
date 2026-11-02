export const ISSUE_TASK = "Issue Task";
export const ONLINE_TASK = "Online Task";

const PUBMAT_SUFFIX = /\s*\(Online Pubmat\)$/i;

// Edit forms carry partial tasks, so every field is optional here.
type KindSource = {
  title?: string | null;
  taskKind?: string | null;
  typeOfRelease?: string | null;
  sourceSheetTitle?: string | null;
};

const ISSUEISH = /issue/;
const ONLINEISH = /online|pubmat/;

// Which pipeline a card lives on. type_of_release used to carry both this and the
// member-facing wording, so rows saved before the split are still read from the
// signals they did leave: the "(Online Pubmat)" title marker and an "online" format.
export function taskKindOf(task: KindSource): string {
  const stored = (task.taskKind || "").trim().toLowerCase();
  if (stored && ONLINEISH.test(stored)) return ONLINE_TASK;
  if (stored && ISSUEISH.test(stored)) return ISSUE_TASK;
  if (PUBMAT_SUFFIX.test(task.title || "")) return ONLINE_TASK;
  if (ONLINEISH.test((task.typeOfRelease || "").toLowerCase())) return ONLINE_TASK;
  return ISSUE_TASK;
}

export const isOnlineTask = (task: KindSource): boolean => taskKindOf(task) === ONLINE_TASK;
export const isPrintTask = (task: KindSource): boolean => taskKindOf(task) === ISSUE_TASK;

// The only release wording members ever see. "Issue Task"/"Online Task" stay in the
// database; a piece that came off an issue sheet reads "Issue Article" on both of its
// cards, including the pubmat half and the rows saved before task_kind existed.
export function releaseFormatLabel(task: KindSource): string {
  const fromIssueSheet = hasPubmatSuffix(task.title) || Boolean((task.sourceSheetTitle || "").trim());
  if (isOnlineTask(task) && fromIssueSheet) return "Issue Article";
  const stored = (task.typeOfRelease || "").trim();
  const lower = stored.toLowerCase();
  if (ISSUEISH.test(lower)) return "Issue Article";
  if (ONLINEISH.test(lower)) return "Online Article";
  if (stored) return stored;
  return isOnlineTask(task) ? "Online Article" : "Issue Article";
}

export const stripPubmatSuffix = (title: string): string => (title || "").replace(PUBMAT_SUFFIX, "").trim();

export const hasPubmatSuffix = (title: string | undefined): boolean => PUBMAT_SUFFIX.test(title || "");

export const withPubmatSuffix = (title: string): string => `${stripPubmatSuffix(title)} (Online Pubmat)`;
