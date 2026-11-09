// Transport for the shared board. Knows how to read and write the News project's rows,
// nothing about React or about what a task stage means — store.ts owns the queue and the
// retry, components never import this file.
//
// The board is one JSON document rather than a table per collection on purpose: every
// mutation in this app is a recipe over the whole state, so a document keeps the pipeline
// code exactly as it is and one integer column (rev) gives the compare-and-set that stops
// two editors from overwriting each other.
import { Assessment } from "../types";
import { ASSESSMENT_TABLE, BOARD_TABLE, supabase } from "./supabase";
import { NewsState } from "./store";

export const BOARD_ID = 1;

export interface BoardRow {
  doc: NewsState;
  rev: number;
  updatedBy: string;
}

/** One flat shape on purpose: this tsconfig has no strictNullChecks, so a discriminated
    union would not narrow at the call site. */
export interface PushResult {
  ok: boolean;
  rev: number;
  reason: "" | "conflict" | "error";
  message: string;
  row: BoardRow | null;
}

const pushed = (rev: number): PushResult => ({ ok: true, rev, reason: "", message: "", row: null });
const clashed = (row: BoardRow | null): PushResult => ({ ok: false, rev: 0, reason: "conflict", message: "", row });
const failed = (message: string): PushResult => ({ ok: false, rev: 0, reason: "error", message, row: null });

/** Assessments never travel in the shared document — see loadAssessments(). */
function toDoc(state: NewsState): NewsState {
  return { ...state, assessments: [] };
}

function rowToBoard(row: Record<string, unknown>): BoardRow {
  return {
    doc: row.doc as NewsState,
    rev: Number(row.rev),
    updatedBy: (row.updated_by as string) || "",
  };
}

export async function fetchBoard(): Promise<BoardRow | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.from(BOARD_TABLE).select("*").eq("id", BOARD_ID).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToBoard(data) : null;
}

/** Write the document only if `expectedRev` is still current, so a stale tab cannot clobber. */
export async function pushBoard(state: NewsState, expectedRev: number | null, updatedBy: string): Promise<PushResult> {
  const sb = supabase();
  if (!sb) return failed("No Supabase project configured.");
  const doc = toDoc(state);

  try {
    if (expectedRev === null) {
      const { data, error } = await sb
        .from(BOARD_TABLE)
        .upsert({ id: BOARD_ID, doc, rev: 1, updated_by: updatedBy }, { onConflict: "id" })
        .select("*")
        .single();
      if (error) return failed(error.message);
      return pushed(Number(data.rev));
    }

    const next = expectedRev + 1;
    const { data, error } = await sb
      .from(BOARD_TABLE)
      .update({ doc, rev: next, updated_by: updatedBy })
      .eq("id", BOARD_ID)
      .eq("rev", expectedRev)
      .select("*");
    if (error) return failed(error.message);
    if (!data || data.length === 0) return clashed(await fetchBoard());
    return pushed(next);
  } catch (err) {
    return failed(err instanceof Error ? err.message : "Write failed.");
  }
}

/** Live updates from other members. Returns the unsubscribe. */
export function subscribeBoard(onRemote: (row: BoardRow) => void): () => void {
  const sb = supabase();
  if (!sb) return () => {};
  const channel = sb
    .channel("mkule-news-board")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: BOARD_TABLE }, (p) => {
      onRemote(rowToBoard(p.new as Record<string, unknown>));
    })
    .subscribe();
  return () => { sb.removeChannel(channel); };
}

// ---------------------------------------------------------------------------
// Assessments: one row per rating, so row-level security can show a member only
// the assessments they wrote and the ones written about them.
// ---------------------------------------------------------------------------

export async function loadAssessments(): Promise<Assessment[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb.from(ASSESSMENT_TABLE).select("*");
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    id: String(r.id),
    kind: r.kind as Assessment["kind"],
    period: r.period as string,
    raterEmail: r.rater_email as string,
    subjectEmail: r.subject_email as string,
    scores: (r.scores ?? {}) as Assessment["scores"],
    comments: (r.comments ?? "") as string,
    updatedAt: r.updated_at as string,
  }));
}

export async function saveAssessment(a: Assessment): Promise<string> {
  const sb = supabase();
  if (!sb) return "";
  const { error } = await sb.from(ASSESSMENT_TABLE).upsert({
    id: a.id,
    kind: a.kind,
    period: a.period,
    rater_email: a.raterEmail,
    subject_email: a.subjectEmail,
    scores: a.scores,
    comments: a.comments,
    updated_at: a.updatedAt,
  }, { onConflict: "id" });
  return error ? error.message : "";
}
