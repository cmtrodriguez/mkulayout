// The editing-stage machine: who holds the article, what they may do to it, and what
// everyone else hears when they do it.
//
// Shape of a run, exactly as the desk works it today:
//   topic pitch -> pitch with angle -> outline -> outline approval -> drafting
//   -> 1stSE..[N]nthSE (each tier may return to the writer, repeatedly)
//   -> 4AE -> 4EIC -> 4LO (request to the MKuLayout Layout Deputy) -> published
// Two deviations are built in: a news-feat's 1stSE sits with the Associate Editor when the
// section has one, and a same-day article stops after two SE tiers.

import {
  Account, ArtxTask, Custody, NewsNotification, NewsRole,
  ordinal, OutputKind, Pitch, StageEvent, stageLabel,
} from "../types";
import { NewsState, addComment, logStage, mutate, nameOf, newId, pushNotification } from "./store";

export const SHEETS_URL = import.meta.env.VITE_SHORTFORM_APPS_SCRIPT_URL || "";
export const MKULAYOUT_URL = import.meta.env.VITE_MKULAYOUT_URL || "https://mkulayout.vercel.app";

export type ActionKey =
  | "submit-angle" | "approve-angle" | "revise-angle"
  | "submit-outline" | "approve-outline" | "revise-outline"
  | "send-to-se" | "return-for-revisions" | "next-se-round" | "pass-to-ae" | "pass-to-eic"
  | "request-layout" | "confirm-layout" | "publish" | "shelve" | "reopen";

export interface ActionDescriptor {
  key: ActionKey;
  label: string;
  tone: "primary" | "warn" | "ghost" | "pass";
  needsNote?: boolean;
}

/** Lead access: the three editing tiers, plus the Admin, who oversees without holding a
    tier of their own. */
export function isEditorial(role?: NewsRole): boolean {
  return role === "News Editor" || role === "Associate Editor" || role === "Editor-In-Chief" || isAdmin(role);
}

export function isAdmin(role?: NewsRole): boolean {
  return role === "Admin";
}

/** Who may be handed an article to write. Neither the EIC nor the Admin writes. */
export function isWriterRole(role?: NewsRole): boolean {
  return role !== "Editor-In-Chief" && !isAdmin(role);
}

function roleEmail(state: NewsState, role: NewsRole): string {
  return state.accounts.find((a) => a.role === role && a.active)?.email || "";
}

export function newsEditorEmail(state: NewsState): string {
  return roleEmail(state, "News Editor");
}

export function associateEditorEmail(state: NewsState): string {
  return roleEmail(state, "Associate Editor");
}

/** Which lead owns a given SE tier. News-feats open with the Associate Editor when the
    section has one; otherwise the News Editor holds that tier too. */
export function seReviewerEmail(state: NewsState, kind: OutputKind, round: number): string {
  const associate = associateEditorEmail(state);
  if (kind === "news-feat" && round <= 1 && associate) return associate;
  return newsEditorEmail(state);
}

/** The desk a task is on right now. */
export function custodyEmail(state: NewsState, task: ArtxTask): string {
  switch (task.custody) {
    case "writer": return task.writerEmail;
    case "associate-editor": return associateEditorEmail(state) || newsEditorEmail(state);
    case "eic": return roleEmail(state, "Editor-In-Chief");
    case "editor": return seReviewerEmail(state, task.kind, task.seRound);
    case "layout": return state.contacts.layoutDeputyEmail;
    default: return "";
  }
}

export function canViewTask(state: NewsState, viewer: Account, task: ArtxTask): boolean {
  if (isEditorial(viewer.role)) return true;
  return task.writerEmail.toLowerCase() === viewer.email.toLowerCase();
}

/**
 * The moves available to `viewer` on `task`. Every transition the desk described is here;
 * nothing is inferred. Same-day pieces lose the extra SE tiers, and only an editor may
 * shelve, publish or confirm the layout handoff.
 */
export function actionsFor(state: NewsState, viewer: Account, task: ArtxTask): ActionDescriptor[] {
  const out: ActionDescriptor[] = [];
  const isWriter = task.writerEmail.toLowerCase() === viewer.email.toLowerCase();
  const isNewsEditor = viewer.role === "News Editor";
  const isAssociate = viewer.role === "Associate Editor";
  const isEic = viewer.role === "Editor-In-Chief";
  const holderEmail = custodyEmail(state, task);
  const holdsIt = holderEmail.toLowerCase() === viewer.email.toLowerCase();
  const editorialLead = isNewsEditor || isAssociate || isEic;

  if (task.archived || task.stage === "shelved") {
    if (editorialLead) out.push({ key: "reopen", label: "Reopen article", tone: "ghost" });
    return out;
  }

  if (task.stage === "angle") {
    if (isWriter && task.custody === "writer") {
      out.push({ key: "submit-angle", label: "Submit pitch angle", tone: "primary", needsNote: true });
    }
    if (holdsIt && !isWriter) {
      out.push({ key: "approve-angle", label: "Approve angle, clear for outline", tone: "pass" });
      out.push({ key: "revise-angle", label: "Ask for another angle", tone: "warn", needsNote: true });
    }
  }

  if (task.stage === "outline" && isWriter) {
    out.push({ key: "submit-outline", label: "Submit outline", tone: "primary" });
  }

  if (task.stage === "outline-approval" && holdsIt) {
    out.push({ key: "approve-outline", label: "Approve outline", tone: "pass" });
    out.push({ key: "revise-outline", label: "Return outline for changes", tone: "warn", needsNote: true });
  }

  if (task.stage === "drafting" && isWriter) {
    out.push({ key: "send-to-se", label: `Send to ${ordinal(task.seRound)}SE`, tone: "primary" });
  }

  if (task.stage === "se") {
    if (isWriter && task.custody === "writer") {
      out.push({ key: "send-to-se", label: `Return to ${ordinal(task.seRound)}SE`, tone: "primary" });
    }
    if (holdsIt) {
      out.push({ key: "return-for-revisions", label: "Return to writer for revisions", tone: "warn", needsNote: true });
      const capped = task.sameDay && task.seRound >= 2;
      if (!capped) out.push({ key: "next-se-round", label: `Pass to ${ordinal(task.seRound + 1)}SE`, tone: "pass" });
      out.push({ key: "pass-to-ae", label: "Confirm and pass to 4AE", tone: "pass" });
    }
  }

  if (task.stage === "ae") {
    if (isWriter && task.custody === "writer") {
      out.push({ key: "send-to-se", label: "Return to 4AE", tone: "primary" });
    }
    if (holdsIt || isAssociate || isNewsEditor) {
      out.push({ key: "return-for-revisions", label: "Return to writer for revisions", tone: "warn", needsNote: true });
      out.push({ key: "pass-to-eic", label: "Pass to 4EIC", tone: "pass" });
    }
  }

  if (task.stage === "eic") {
    if (isWriter && task.custody === "writer") {
      out.push({ key: "send-to-se", label: "Return to 4EIC", tone: "primary" });
    }
    if (holdsIt || isEic) {
      out.push({ key: "return-for-revisions", label: "Return to writer for revisions", tone: "warn", needsNote: true });
      out.push({ key: "request-layout", label: "Request online pub from Layout", tone: "pass", needsNote: true });
    }
  }

  if (task.stage === "layout") {
    if (editorialLead && !task.layoutHandoff?.confirmed) {
      out.push({ key: "confirm-layout", label: "Mark online task confirmed", tone: "pass", needsNote: true });
    }
    if (editorialLead) out.push({ key: "publish", label: "Mark published", tone: "pass" });
  }

  if (task.stage === "published") {
    if (editorialLead) out.push({ key: "shelve", label: "Archive", tone: "ghost" });
    return out;
  }

  if (editorialLead) {
    out.push({ key: "shelve", label: "Shelve", tone: "ghost", needsNote: true });
  }
  return out;
}

function actorEvent(actor: Account, stage: ArtxTask["stage"], action: string, note?: string): StageEvent {
  return { at: new Date().toISOString(), byName: actor.name, byEmail: actor.email, stage, action, note };
}

function chat(draft: NewsState, taskId: string, actor: Account, text: string) {
  addComment(draft, {
    taskId, authorName: actor.name, authorEmail: actor.email,
    authorRole: actor.role, text, isSystem: true,
  });
}

function targetMail(draft: NewsState, opts: { title: string; message: string; targets: string[]; type: NewsNotification["type"]; taskId: string }) {
  pushNotification(draft, {
    title: opts.title, message: opts.message, type: opts.type,
    targetEmails: opts.targets.filter(Boolean), taskId: opts.taskId,
  });
}

/**
 * Applies one stage move. The task, its chat thread, the notifications and the pitch bank
 * all update in the same mutation so no desk can end up showing a stale stage.
 */
export function applyAction(task: ArtxTask, actor: Account, key: ActionKey, note?: string) {
  mutate((draft) => {
    const t = draft.tasks.find((x) => x.id === task.id);
    if (!t) return;
    const now = new Date().toISOString();
    const writer = { email: t.writerEmail, name: t.writerName };

    switch (key) {
      case "submit-angle":
        t.angleText = note || t.angleText;
        t.custody = "editor";
        logStage(t, actorEvent(actor, t.stage, "submitted pitch angle", note));
        chat(draft, t.id, actor, `Pitch angle submitted: ${note || ""}`);
        targetMail(draft, { title: `Angle submitted — ${t.title}`, message: `${actor.name} sent the pitch angle back for review.`, targets: [seReviewerEmail(draft, t.kind, t.seRound)], type: "stage", taskId: t.id });
        break;

      case "approve-angle":
        t.stage = "outline";
        t.custody = "writer";
        logStage(t, actorEvent(actor, "outline", "approved angle, cleared for outline", note));
        chat(draft, t.id, actor, "Angle approved. Outline may begin.");
        targetMail(draft, { title: `Angle approved — ${t.title}`, message: "The editor approved your angle. Start the outline.", targets: [writer.email], type: "stage", taskId: t.id });
        break;

      case "revise-angle":
        t.custody = "writer";
        logStage(t, actorEvent(actor, "angle", "asked for another angle", note));
        chat(draft, t.id, actor, `Angle sent back: ${note || ""}`);
        targetMail(draft, { title: `New angle needed — ${t.title}`, message: note || "The editor wants a different angle before the outline.", targets: [writer.email], type: "revision", taskId: t.id });
        break;

      case "submit-outline":
        t.stage = "outline-approval";
        t.custody = "editor";
        logStage(t, actorEvent(actor, "outline-approval", "submitted outline", note));
        chat(draft, t.id, actor, `Outline submitted${t.outlineLink ? `: ${t.outlineLink}` : ""}`);
        targetMail(draft, { title: `Outline for review — ${t.title}`, message: `${actor.name} submitted the outline for approval.`, targets: [seReviewerEmail(draft, t.kind, 1)], type: "stage", taskId: t.id });
        break;

      case "approve-outline":
        t.stage = "drafting";
        t.outlineApproved = true;
        t.custody = "writer";
        logStage(t, actorEvent(actor, "drafting", "approved outline", note));
        chat(draft, t.id, actor, "Outline approved. Drafting is open.");
        targetMail(draft, { title: `Outline approved — ${t.title}`, message: "Outline approved. Send it to the first SE when the draft is ready.", targets: [writer.email], type: "stage", taskId: t.id });
        break;

      case "revise-outline":
        t.stage = "outline";
        t.custody = "writer";
        logStage(t, actorEvent(actor, "outline", "returned outline for changes", note));
        chat(draft, t.id, actor, `Outline returned for changes: ${note || ""}`);
        targetMail(draft, { title: `Outline returned — ${t.title}`, message: note || "The outline needs changes.", targets: [writer.email], type: "revision", taskId: t.id });
        break;

      case "send-to-se": {
        const reviewer = seReviewerEmail(draft, t.kind, t.seRound);
        t.stage = "se";
        t.custody = "editor";
        logStage(t, actorEvent(actor, "se", `handed to ${ordinal(t.seRound)}SE`, note));
        chat(draft, t.id, actor, `Now with the ${ordinal(t.seRound)}SE.`);
        targetMail(draft, { title: `${ordinal(t.seRound)}SE — ${t.title}`, message: `${actor.name} passed the article to you for the ${ordinal(t.seRound)} edit.`, targets: [reviewer], type: "stage", taskId: t.id });
        break;
      }

      case "return-for-revisions":
        t.custody = "writer";
        logStage(t, actorEvent(actor, t.stage, "returned to writer for revisions", note));
        chat(draft, t.id, actor, `Returned for revisions at ${stageLabel(t)}: ${note || ""}`);
        targetMail(draft, { title: `Revisions — ${t.title}`, message: note || `Revisions requested at ${stageLabel(t)}.`, targets: [writer.email], type: "revision", taskId: t.id });
        break;

      case "next-se-round": {
        const nextRound = t.seRound + 1;
        t.seRound = nextRound;
        t.stage = "se";
        t.custody = "editor";
        logStage(t, actorEvent(actor, "se", `passed to ${ordinal(nextRound)}SE`, note));
        chat(draft, t.id, actor, `Cleared ${ordinal(nextRound - 1)}SE. Now with the ${ordinal(nextRound)}SE.`);
        targetMail(draft, { title: `${ordinal(nextRound)}SE — ${t.title}`, message: `The article cleared ${ordinal(nextRound - 1)}SE and is yours for the ${ordinal(nextRound)} edit.`, targets: [seReviewerEmail(draft, t.kind, nextRound)], type: "stage", taskId: t.id });
        break;
      }

      case "pass-to-ae": {
        const ae = associateEditorEmail(draft) || newsEditorEmail(draft);
        t.stage = "ae";
        t.custody = "associate-editor";
        logStage(t, actorEvent(actor, "ae", "passed to 4AE", note));
        chat(draft, t.id, actor, `Editing tiers closed at ${ordinal(t.seRound)}SE. Passed to 4AE.`);
        targetMail(draft, { title: `4AE — ${t.title}`, message: `${actor.name} passed the article to you for 4AE.`, targets: [ae], type: "stage", taskId: t.id });
        break;
      }

      case "pass-to-eic": {
        const eic = roleEmail(draft, "Editor-In-Chief");
        t.stage = "eic";
        t.custody = "eic";
        logStage(t, actorEvent(actor, "eic", "passed to 4EIC", note));
        chat(draft, t.id, actor, "Passed to 4EIC.");
        targetMail(draft, { title: `4EIC — ${t.title}`, message: `${actor.name} passed the article to the Editor-In-Chief.`, targets: [eic], type: "stage", taskId: t.id });
        break;
      }

      case "request-layout": {
        t.stage = "layout";
        t.custody = "layout";
        t.layoutHandoff = { requestedAt: now, requestedBy: actor.email, note: note || "", confirmed: false };
        logStage(t, actorEvent(actor, "layout", "requested online pub task from Layout", note));
        chat(draft, t.id, actor, `4LO request sent to the MKuLayout Layout Deputy: ${note || "online pub task"}`);
        targetMail(draft, {
          title: `4LO — ${t.title}`,
          message: "News handed this article to Layout as an online pub task request. Confirm it as an online task in MKuLayout.",
          targets: [draft.contacts.layoutDeputyEmail, draft.contacts.layoutEditorEmail].filter(Boolean),
          type: "ping", taskId: t.id,
        });
        break;
      }

      case "confirm-layout":
        t.layoutHandoff = { ...(t.layoutHandoff || { requestedAt: now, requestedBy: actor.email, note: "", confirmed: false }), confirmed: true, note: note || t.layoutHandoff?.note || "" };
        logStage(t, actorEvent(actor, "layout", "Layout confirmed the online task", note));
        chat(draft, t.id, actor, `Layout confirmed the online pub task. ${note || ""}`);
        targetMail(draft, { title: `Layout confirmed — ${t.title}`, message: `The Layout Deputy confirmed this as an online task. ${note || ""}`.trim(), targets: [writer.email, ...draft.accounts.filter((a) => isEditorial(a.role)).map((a) => a.email)], type: "stage", taskId: t.id });
        break;

      case "publish": {
        t.stage = "published";
        t.custody = "none";
        t.publishedAt = now;
        logStage(t, actorEvent(actor, "published", "published", note));
        chat(draft, t.id, actor, "Published. The article is closed out of the pipeline.");
        // A published article leaves the pitch bank for good.
        if (t.pitchId) {
          draft.pitches = draft.pitches.map((p) => (p.id === t.pitchId ? { ...p, status: "converted", taskId: t.id } : p));
        }
        targetMail(draft, { title: `Published — ${t.title}`, message: "Published and recorded in the news releases list.", targets: [writer.email, ...draft.accounts.map((a) => a.email)], type: "info", taskId: t.id });
        break;
      }

      case "shelve":
        t.stage = "shelved";
        t.custody = "none";
        logStage(t, actorEvent(actor, "shelved", "shelved", note));
        chat(draft, t.id, actor, `Shelved: ${note || "no reason given"}`);
        targetMail(draft, { title: `Shelved — ${t.title}`, message: note || "An editor shelved this article.", targets: [writer.email], type: "info", taskId: t.id });
        break;

      case "reopen":
        t.stage = "drafting";
        t.custody = "writer";
        logStage(t, actorEvent(actor, "drafting", "reopened", note));
        chat(draft, t.id, actor, "Reopened for drafting.");
        targetMail(draft, { title: `Reopened — ${t.title}`, message: note || "This article is back in the pipeline.", targets: [writer.email], type: "assignment", taskId: t.id });
        break;
    }

    const idx = draft.tasks.findIndex((x) => x.id === t.id);
    if (idx >= 0) draft.tasks = draft.tasks.map((x) => (x.id === t.id ? { ...t } : x));
  });
}

/** The SE's two ping buttons: an illustration, or iskotistiks from Layout. */
export function sendProductionPing(task: ArtxTask, actor: Account, kind: "illustration" | "iskotistiks") {
  mutate((draft) => {
    const t = draft.tasks.find((x) => x.id === task.id);
    if (!t) return;
    const target = kind === "illustration" ? draft.contacts.illustrationEditorEmail : draft.contacts.layoutEditorEmail;
    const label = kind === "illustration" ? "Illustration Editor" : "Layout Editor (iskotistiks)";
    if (kind === "illustration") t.needsIllustration = true;
    else t.needsIskotistiks = true;
    draft.tasks = draft.tasks.map((x) => (x.id === t.id ? { ...t } : x));
    logStage(t, actorEvent(actor, t.stage, `requested ${kind === "illustration" ? "illustration" : "iskotistiks"}`));
    chat(draft, t.id, actor, `Requested ${kind === "illustration" ? "an illustration" : "iskotistiks"} from the ${label}.`);
    pushNotification(draft, {
      title: `${kind === "illustration" ? "Illustration request" : "Iskotistiks request"} — ${t.title}`,
      message: `${actor.name} asked the ${label} to prepare artwork for ${stageLabel(t)} on this article.`,
      type: "ping", targetEmails: [target].filter(Boolean), taskId: t.id,
    });
  });
}

// ---------------------------------------------------------------------------
// Pitch bank -> article
// ---------------------------------------------------------------------------

export function createPitch(draft: NewsState, input: { topic: string; notes: string; kind: OutputKind; sourceName: string; sourceEmail: string }) {
  const pitch: Pitch = {
    id: newId("ptch"), topic: input.topic.trim(), notes: input.notes.trim(),
    kind: input.kind === "news-feat" ? "news-feat" : "news-article",
    sourceName: input.sourceName, sourceEmail: input.sourceEmail,
    status: "open", createdAt: new Date().toISOString(),
  };
  draft.pitches = [pitch, ...draft.pitches];
  const editors = draft.accounts.filter((a) => a.role === "News Editor" || a.role === "Associate Editor").map((a) => a.email);
  pushNotification(draft, {
    title: "New pitch in the bank", message: `${input.sourceName} pitched: ${pitch.topic}`,
    type: "pitch", targetEmails: editors,
  });
  return pitch;
}

/** Grabbing a pitch is what makes it "mine", and it is the section editor who hears it. */
export function grabPitch(pitch: Pitch, actor: Account) {
  mutate((draft) => {
    const p = draft.pitches.find((x) => x.id === pitch.id);
    if (!p || p.status !== "open") return;
    p.status = "grabbed";
    p.grabbedBy = actor.email;
    p.grabbedByName = actor.name;
    p.grabbedAt = new Date().toISOString();
    p.angle = { text: "", submittedAt: "", status: "pending" };
    p.outlineStatus = "none";
    const editorEmail = seReviewerEmail(draft, p.kind, 1);
    pushNotification(draft, {
      title: `Pitch grabbed — ${p.topic}`,
      message: `${actor.name} took this pitch. Ask them for the angle before the outline.`,
      type: "pitch", targetEmails: [editorEmail],
    });
    draft.pitches = draft.pitches.map((x) => (x.id === p.id ? { ...p } : x));
  });
}

/**
 * The grabbed pitch becomes the article card. From here the stage machine owns it, and
 * the pitch shows as converted so it stops appearing in the bank.
 */
export function openArticleFromPitch(pitch: Pitch, actor: Account, input: { title: string; writerEmail: string; writerName: string; artxLink: string; releaseDate: string; sameDay: boolean }) {
  let created: ArtxTask | null = null;
  mutate((draft) => {
    const now = new Date().toISOString();
    const task: ArtxTask = {
      id: newId("artx"), kind: pitch.kind, title: input.title.trim() || pitch.topic,
      writerEmail: input.writerEmail, writerName: input.writerName,
      artxLink: input.artxLink.trim(), releaseDate: input.releaseDate, sameDay: input.sameDay,
      priority: input.sameDay ? "Urgent" : "Medium",
      stage: "angle", seRound: 1, custody: "writer", pitchId: pitch.id,
      angleRequested: true, outlineApproved: false,
      needsIllustration: false, needsIskotistiks: false,
      history: [{ at: now, byName: actor.name, byEmail: actor.email, stage: "angle", seRound: 1, action: "opened article from pitch" }],
      createdAt: now, updatedAt: now,
    };
    draft.tasks = [task, ...draft.tasks];
    draft.pitches = draft.pitches.map((p) => (p.id === pitch.id ? { ...p, status: "grabbed", taskId: task.id, angle: p.angle || { text: "", submittedAt: "", status: "pending" }, outlineStatus: "none" } : p));
    addComment(draft, { taskId: task.id, authorName: "MKule News", authorEmail: "system", authorRole: "System", text: `Opened from the pitch bank by ${actor.name}. The editor will ask for the pitch angle before the outline begins.`, isSystem: true });
    pushNotification(draft, {
      title: `Article opened — ${task.title}`, message: `${input.writerName} starts at the pitch-angle stage.`,
      type: "assignment", targetEmails: [input.writerEmail, seReviewerEmail(draft, task.kind, 1)], taskId: task.id,
    });
    created = task;
  });
  return created;
}

/**
 * An article a lead assigns directly instead of taking from the bank. It skips the pitch
 * and angle stages: a same-day piece opens at drafting, everything else opens at outline.
 */
export function addStandaloneArticle(
  draft: NewsState,
  input: { title: string; kind: OutputKind; writerEmail: string; writerName: string; artxLink: string; releaseDate: string; sameDay: boolean; actorName: string; actorEmail: string; actorRole: NewsRole }
): ArtxTask {
  const now = new Date().toISOString();
  const stage: ArtxTask["stage"] = input.sameDay ? "drafting" : "outline";
  const task: ArtxTask = {
    id: newId("artx"), kind: input.kind === "news-feat" ? "news-feat" : "news-article",
    title: input.title.trim(), writerEmail: input.writerEmail, writerName: input.writerName,
    artxLink: input.artxLink.trim(), releaseDate: input.releaseDate, sameDay: input.sameDay,
    priority: input.sameDay ? "Urgent" : "Medium",
    stage, seRound: 1, custody: "writer",
    angleRequested: false, outlineApproved: false,
    needsIllustration: false, needsIskotistiks: false,
    history: [{ at: now, byName: input.actorName, byEmail: input.actorEmail, stage, seRound: 1, action: "assigned directly" }],
    createdAt: now, updatedAt: now,
  };
  draft.tasks = [task, ...draft.tasks];
  addComment(draft, {
    taskId: task.id, authorName: "MKule News", authorEmail: "system", authorRole: "System",
    text: `${input.actorName} assigned this article to ${input.writerName}.`, isSystem: true,
  });
  return task;
}

// ---------------------------------------------------------------------------
// Shortform -> Google Sheets
// ---------------------------------------------------------------------------

export async function syncShortformToSheets(entry: { writer: string; date: string; topic: string; link: string }) {
  if (!SHEETS_URL) return { ok: false, error: "No Apps Script URL configured (VITE_SHORTFORM_APPS_SCRIPT_URL)." };
  try {
    const res = await fetch(SHEETS_URL, {
      method: "POST",
      // text/plain keeps the call a simple request; Apps Script parses the body either way.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ row: [entry.writer, entry.date, entry.topic, entry.link] }),
    });
    if (!res.ok) return { ok: false, error: `Sheet replied ${res.status}.` };
    return { ok: true, error: "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach the sheet." };
  }
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

export interface WorkloadRow {
  account: Account;
  longform: number;
  shortform: number;
  inPipeline: number;
  returns: number;
}

export function workloadByMember(state: NewsState): WorkloadRow[] {
  return state.accounts.filter((a) => a.active).map((account) => {
    const mine = state.tasks.filter((t) => t.writerEmail.toLowerCase() === account.email.toLowerCase());
    const published = mine.filter((t) => t.stage === "published");
    return {
      account,
      longform: published.filter((t) => t.kind !== "shortform").length,
      shortform: state.shortform.filter((s) => s.writerName.trim().toLowerCase() === account.name.toLowerCase()).length,
      inPipeline: mine.filter((t) => t.stage !== "published" && t.stage !== "shelved" && !t.archived).length,
      returns: mine.reduce((sum, t) => sum + t.history.filter((h) => h.action.startsWith("returned")).length, 0),
    };
  });
}

export const PIPELINE_COLUMNS: { key: string; label: string; match: (t: ArtxTask) => boolean }[] = [
  { key: "angle", label: "Pitch with angle", match: (t) => t.stage === "angle" },
  { key: "outline", label: "Outline", match: (t) => t.stage === "outline" || t.stage === "outline-approval" },
  { key: "drafting", label: "Drafting", match: (t) => t.stage === "drafting" },
  { key: "se", label: "SE tiers", match: (t) => t.stage === "se" },
  { key: "ae", label: "4AE", match: (t) => t.stage === "ae" },
  { key: "eic", label: "4EIC", match: (t) => t.stage === "eic" },
  { key: "layout", label: "4LO", match: (t) => t.stage === "layout" },
  { key: "published", label: "Published", match: (t) => t.stage === "published" },
];

export function daysSince(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));
}

export function taskAgeLabel(task: ArtxTask): string {
  const at = task.updatedAt || task.createdAt;
  const days = daysSince(at);
  return days === 0 ? "today" : `${days}d at stage`;
}

export function holderLabel(state: NewsState, task: ArtxTask): string {
  const email = custodyEmail(state, task);
  if (!email) return task.custody === "layout" ? "Layout Deputy" : "—";
  return `${nameOf(state, email)} · ${state.accounts.find((a) => a.email === email)?.role || ""}`;
}

export function custodyOfLabel(custody: Custody): string {
  return custody === "none" ? "closed" : custody.replace("-", " ");
}
