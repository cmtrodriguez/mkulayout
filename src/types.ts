// MKule News domain model.
//
// The whole app reads and writes one NewsState object (see lib/store.ts). Nothing here
// touches the MKuLayout database: the two tools only meet at the 4LO handoff, where a
// finished article becomes a request the Layout Deputy confirms as an online pub task.

export type NewsRole =
  | "Admin"
  | "News Editor"
  | "Associate Editor"
  | "News Probi"
  | "News Staffer"
  | "Editor-In-Chief";

export interface Account {
  email: string;
  name: string;
  role: NewsRole;
  /** Sign-in is matched on the Google address, so only an address in REGISTERED_EMAILS
      ever opens the desk. */
  active: boolean;
}

// ---------------------------------------------------------------------------
// Editing stages
// ---------------------------------------------------------------------------

export type OutputKind = "news-article" | "news-feat" | "shortform";

/**
 * pitch / angle / outline / outline-approval / drafting happen before the first
 * editing tier. `se` is the tiered stage: its label is `${seRound}SE` (1stSE, 2ndSE…
 * [N]nthSE), `ae` is 4AE, `EIC` is 4EIC, `layout` is the 4LO request, and `published`
 * is the release. `shelved` parks a task without deleting it.
 */
export type StageKey =
  | "pitch"
  | "angle"
  | "outline"
  | "outline-approval"
  | "drafting"
  | "se"
  | "ae"
  | "eic"
  | "layout"
  | "published"
  | "shelved";

/** Whose desk the article is on right now. */
export type Custody = "writer" | "editor" | "associate-editor" | "eic" | "layout" | "none";

export interface StageEvent {
  at: string;
  byName: string;
  byEmail: string;
  stage: StageKey;
  seRound?: number;
  action: string;
  note?: string;
}

export interface ArtxTask {
  id: string;
  kind: OutputKind;
  title: string;
  writerEmail: string;
  writerName: string;
  /** The one workspace link a news card carries: the artx Google Doc. */
  artxLink: string;
  releaseDate: string;
  sameDay: boolean;
  priority: "Low" | "Medium" | "High" | "Urgent";
  stage: StageKey;
  seRound: number;
  custody: Custody;
  pitchId?: string;
  /** Set when the SE asks the writer for an angle before the outline. */
  angleRequested: boolean;
  angleText?: string;
  outlineLink?: string;
  outlineApproved: boolean;
  /** The SE can ping Illustration for an illu, or Layout for iskotistiks. */
  needsIllustration: boolean;
  needsIskotistiks: boolean;
  layoutHandoff?: { requestedAt: string; requestedBy: string; note: string; confirmed: boolean };
  publishedAt?: string;
  archived?: boolean;
  history: StageEvent[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Pitch bank
// ---------------------------------------------------------------------------

export interface Pitch {
  id: string;
  topic: string;
  notes: string;
  /** Pitches may come from anyone, including members outside News. */
  sourceName: string;
  sourceEmail: string;
  kind: Exclude<OutputKind, "shortform">;
  status: "open" | "grabbed" | "converted" | "declined";
  grabbedBy?: string;
  grabbedByName?: string;
  grabbedAt?: string;
  angle?: { text: string; submittedAt: string; status: "pending" | "approved" | "changes" };
  outlineLink?: string;
  outlineStatus?: "none" | "submitted" | "approved";
  taskId?: string;
  declinedReason?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Shortform
// ---------------------------------------------------------------------------

export interface ShortformEntry {
  id: string;
  writerName: string;
  date: string;
  topic: string;
  link: string;
  /** Row sync to Google Sheets is explicit: an entry is only marked synced once the
      sheet actually accepted the row. */
  syncStatus: "pending" | "synced" | "failed";
  syncedAt?: string;
  syncError?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Chat, notifications, roster, planning
// ---------------------------------------------------------------------------

export interface TaskComment {
  id: string;
  taskId: string;
  authorName: string;
  authorEmail: string;
  authorRole: NewsRole | "System";
  text: string;
  timestamp: string;
  editedAt?: string;
  isSystem?: boolean;
}

export interface NewsNotification {
  id: string;
  title: string;
  message: string;
  type: "info" | "assignment" | "revision" | "stage" | "ping" | "pitch";
  timestamp: string;
  targetEmails: string[];
  readBy: string[];
  taskId?: string;
}

export interface WeeklyAvailability {
  email: string;
  /** Keys are "Mon".."Sun", values are the hours that person can take work. */
  days: Record<string, string[]>;
  unavailableDays: string[];
  lastUpdated?: string;
}

export interface Todo {
  id: string;
  ownerEmail: string;
  title: string;
  due: string;
  done: boolean;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  date: string;
  kind: "deadline" | "interview" | "meeting" | "release";
  notes?: string;
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

export interface Assessment {
  id: string;
  /** monthly: the News Editor rates a member. semestral: a member rates the Editor. */
  kind: "monthly" | "semestral";
  period: string;
  raterEmail: string;
  subjectEmail: string;
  scores: Record<string, number>;
  comments: string;
  updatedAt: string;
}

export const NEWS_QUESTIONS = [
  { key: "accuracy", label: "Accuracy", question: "Are facts, names, titles and figures correct and sourced?" },
  { key: "interviewing", label: "Interviewing", question: "Did the writer secure and follow through on interviews needed for the piece?" },
  { key: "structure", label: "Structure", question: "Does the article lead well and hold a clear, logical throughline?" },
  { key: "deadlines", label: "Deadlines", question: "Were outline, draft and revisions delivered on the agreed dates?" },
  { key: "revisions", label: "Revisions", question: "How did the writer handle returns — addressed, or the same notes repeated?" },
] as const;

export const EDITOR_QUESTIONS = [
  { key: "clarity", label: "Feedback clarity", question: "Are the editing notes specific enough to act on?" },
  { key: "turnaround", label: "Turnaround", question: "Does the editor return pieces within the time the desk needs?" },
  { key: "guidance", label: "Guidance", question: "Does the editor help shape the pitch and angle rather than only correct the draft?" },
  { key: "fairness", label: "Fairness", question: "Are workload, credit and returns applied evenly across the section?" },
  { key: "approachability", label: "Approachability", question: "Can members raise a problem or a missed deadline without hesitation?" },
] as const;

// ---------------------------------------------------------------------------
// Stage labels
// ---------------------------------------------------------------------------

export const SE_SUFFIX = ["st", "nd", "rd", "th"];

/** 1st, 2nd, 3rd, 4th, then 5th… — the "[Number]nthSE" case the desk uses. */
export function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`;
  return `${n}${SE_SUFFIX[(n - 1) % 4] || "th"}`;
}

export function stageLabel(task: Pick<ArtxTask, "stage" | "seRound">): string {
  switch (task.stage) {
    case "se": return `${ordinal(task.seRound)}SE`;
    case "ae": return "4AE";
    case "eic": return "4EIC";
    case "layout": return "4LO";
    case "outline-approval": return "Outline approval";
    case "outline": return "Outline writing";
    case "angle": return "Pitch with angle";
    case "pitch": return "Topic pitch";
    case "drafting": return "Drafting";
    case "published": return "Published";
    case "shelved": return "Shelved";
    default: return task.stage;
  }
}

// ---------------------------------------------------------------------------
// Seeded roster
// ---------------------------------------------------------------------------

export const SEED_ACCOUNTS: Account[] = [
  { email: "ctrodriguez2@up.edu.ph", name: "Xtian Rodriguez", role: "Admin", active: true },
  { email: "ascainglet@up.edu.ph", name: "Axel Cainglet", role: "Editor-In-Chief", active: true },
  { email: "atcastillo2@up.edu.ph", name: "Armel Castillo", role: "News Editor", active: true },
  { email: "aponce@up.edu.ph", name: "Anicka Ponce", role: "News Probi", active: true },
  { email: "jbdave@up.edu.ph", name: "Jomig Dave", role: "News Staffer", active: true },
];

/**
 * The addresses this desk opens for, and nothing else. A Google account outside this list
 * signs in to Supabase successfully and is still refused here.
 *
 * The list is a build constant on purpose: the roster is stored in the shared board, so
 * letting the board widen access would let anyone with a session let anyone else in. Adding
 * a member means adding their address here and shipping a new build.
 */
export const REGISTERED_EMAILS: readonly string[] = SEED_ACCOUNTS.map((a) => a.email);

export function isRegisteredEmail(email?: string | null): boolean {
  if (!email) return false;
  const wanted = email.trim().toLowerCase();
  return REGISTERED_EMAILS.some((e) => e.toLowerCase() === wanted);
}

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const TIME_SLOTS = ["6am", "7am", "8am", "9am", "10am", "11am", "12nn", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm"];

export const ROLE_ORDER: Record<NewsRole, number> = {
  "Admin": 0,
  "News Editor": 1,
  "Associate Editor": 2,
  "News Probi": 3,
  "News Staffer": 4,
  "Editor-In-Chief": 5,
};

export interface QuickLink {
  id: string;
  label: string;
  url: string;
}

/** Labels are the desk's own; the URLs are left for the editor to set because they are
    not something this app can guess. */
export const SEED_QUICK_LINKS: QuickLink[] = [
  { id: "interview-invitation", label: "Interview invitation template", url: "" },
  { id: "mkule-doc", label: "MKule document template", url: "" },
  { id: "artx-doc", label: "Artx document template", url: "" },
  { id: "releases-tracker", label: "Releases tracker", url: "" },
];

/** The Layout-side people News hands work to. Their addresses are not this section's to
    invent, so they stay blank until a lead maps them in Settings — a ping or a 4LO
    request says so rather than silently going nowhere. */
export interface NewsContacts {
  layoutDeputyEmail: string;
  layoutEditorEmail: string;
  illustrationEditorEmail: string;
}

export const SEED_CONTACTS: NewsContacts = {
  layoutDeputyEmail: "",
  layoutEditorEmail: "",
  illustrationEditorEmail: "",
};

export const RELEASES_TRACKER_LINK_ID = "releases-tracker";
