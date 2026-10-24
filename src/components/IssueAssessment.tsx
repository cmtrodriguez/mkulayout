import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Star, X, Loader2, AlertCircle, ExternalLink, BarChart3, Users, ListPlus, CornerDownRight, Trash2
} from "lucide-react";
import {
  ASSESSMENT_QUESTIONS, AssessmentReply, IssueAssessmentEntry, IssueAssessments, TeamMember
} from "../types";
import { ISSUES } from "../lib/issues";
import { getIssuePageImage, getIssuePageSpans, pageSpanLabel, IssuePageSpan } from "../lib/issuePages";
import { getPreferredFirstName } from "../lib/memberUtils";

interface IssueAssessmentProps {
  assessments: IssueAssessments;
  members: TeamMember[];
  currentUserEmail: string;
  currentUserRole?: string;
  onSubmit: (input: { issueKey: string; page: number; entry: IssueAssessmentEntry }) => void;
  onReply: (input: { issueKey: string; memberEmail: string; page: number; reply: AssessmentReply | null }) => void;
}

const THUMB_WIDTH = 170;
const FULLSCREEN_WIDTH = 1500;

const emptyEntry = (): IssueAssessmentEntry => ({
  layout: 0, typography: 0, images: 0, bullets: [], updatedAt: new Date().toISOString()
});

function memberLabel(email: string, members: TeamMember[]): string {
  const fromRoster = members.find((m) => (m.email || "").toLowerCase() === email.toLowerCase());
  if (fromRoster) return getPreferredFirstName(fromRoster.name || "", fromRoster.email || "");
  return email.split("@")[0];
}

/** Averages one question over every member's rating that actually has a value. */
function average(values: number[]): { score: number; count: number } {
  const rated = values.filter((v) => v >= 1);
  if (!rated.length) return { score: 0, count: 0 };
  return { score: rated.reduce((sum, v) => sum + v, 0) / rated.length, count: rated.length };
}

function StarPicker({
  value, onChange, label
}: { value: number; onChange: (stars: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((stars) => (
        <button
          key={stars}
          type="button"
          role="radio"
          aria-checked={value === stars}
          aria-label={`${stars} of 5 for ${label}`}
          onClick={() => onChange(stars)}
          className={`p-0.5 cursor-pointer transition-colors ${
            stars <= value ? "text-amber-500" : "text-neutral-300 dark:text-neutral-600 hover:text-amber-300"
          }`}
        >
          <Star className="w-3.5 h-3.5" fill={stars <= value ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

function ScoreReadout({ score, count }: { score: number; count: number }) {
  if (!count) {
    return <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-semibold">Not rated yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-neutral-600 dark:text-neutral-300">
      <Star className="w-3 h-3 text-amber-500" fill="currentColor" />
      {score.toFixed(2)}
      <span className="text-neutral-400 dark:text-neutral-500 font-semibold">({count})</span>
    </span>
  );
}

/** Renders one page only once it scrolls into view, then keeps its picture. */
function PagePicture({
  issueKey, page, width, onOpen
}: { issueKey: string; page: number; width: number; onOpen?: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const node = holder.current;
    if (!node) return;

    const draw = () => {
      getIssuePageImage(issueKey, page, width)
        .then((objectUrl) => { if (!cancelled) setUrl(objectUrl); })
        .catch((err) => { if (!cancelled) setError(err?.message || "This page could not be drawn."); });
    };

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        draw();
      }
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => { observer.disconnect(); cancelled = true; };
  }, [issueKey, page, width]);

  return (
    <div ref={holder} className="relative w-[64px] sm:w-[86px] shrink-0">
      <button
        type="button"
        onClick={onOpen}
        disabled={!url || !!error}
        title={onOpen ? "Show this page in full screen" : undefined}
        className="block w-full aspect-[612/792] rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 overflow-hidden group cursor-zoom-in disabled:cursor-default"
      >
        {url ? (
          <img src={url} alt={`Issue ${issueKey} page ${page}`} className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.04]" />
        ) : error ? (
          <span className="w-full h-full flex items-center justify-center text-neutral-400"><AlertCircle className="w-4 h-4" /></span>
        ) : (
          <span className="w-full h-full flex items-center justify-center text-neutral-400"><Loader2 className="w-4 h-4 animate-spin" /></span>
        )}
      </button>
      {error && <p className="mt-1 text-[9px] text-rose-600 dark:text-rose-400 leading-tight">{error}</p>}
    </div>
  );
}

/** One bullet line of a member's note list; empty lines are dropped on commit. */
function BulletList({
  bullets, onChange, onCommit, disabled
}: {
  bullets: string[];
  onChange: (next: string[]) => void;
  onCommit: (next: string[]) => void;
  disabled?: boolean;
}) {
  const clean = (lines: string[]) => lines.map((line) => line.trim()).filter(Boolean);

  return (
    <div className="space-y-1.5">
      {bullets.map((line, index) => (
        <div key={index} className="flex items-start gap-1.5">
          <span className="mt-2 w-1.5 h-1.5 rounded-full bg-brand-maroon/70 shrink-0" aria-hidden="true" />
          <input
            type="text"
            value={line}
            disabled={disabled}
            placeholder="One note for this page"
            onChange={(event) => {
              const next = [...bullets];
              next[index] = event.target.value;
              onChange(next);
            }}
            onBlur={() => onCommit(bullets)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCommit(bullets);
                onChange([...clean(bullets), ""]);
              }
              if (event.key === "Backspace" && !line) {
                event.preventDefault();
                onCommit(bullets.filter((_, i) => i !== index));
              }
            }}
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[11px] sm:text-xs text-neutral-800 dark:text-neutral-200 outline-none focus:ring-1 focus:ring-brand-maroon disabled:opacity-60"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onCommit(bullets.filter((_, i) => i !== index))}
            className="p-1.5 mt-0.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
            aria-label={`Remove note ${index + 1}`}
            title="Remove this note"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...clean(bullets), ""])}
        className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-brand-maroon dark:text-brand-maroon-light hover:underline cursor-pointer disabled:opacity-60"
      >
        <ListPlus className="w-3.5 h-3.5" /> Add bullet
      </button>
    </div>
  );
}

export default function IssueAssessment({
  assessments,
  members,
  currentUserEmail,
  currentUserRole,
  onSubmit,
  onReply,
}: IssueAssessmentProps) {
  const [activeIssue, setActiveIssue] = useState(ISSUES[0].key);
  const [spans, setSpans] = useState<IssuePageSpan[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [fullscreen, setFullscreen] = useState<{ span: IssuePageSpan; url: string } | null>(null);
  const overlay = useRef<HTMLDivElement>(null);

  // Rows are edited locally first, so a member can rate several pages before each
  // write lands; anything absent here falls back to what the board already holds.
  const [drafts, setDrafts] = useState<Record<string, IssueAssessmentEntry>>({});
  // Which member's note list currently has an open reply box.
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  const canSeeSummaries = currentUserRole === "Layout Editor" || currentUserRole === "Layout Deputy";
  const myEmail = (currentUserEmail || "").toLowerCase();

  const issue = ISSUES.find((entry) => entry.key === activeIssue)!;
  const board = assessments[activeIssue] || {};
  const myPages = board[myEmail] || {};

  const entryFor = (page: number): IssueAssessmentEntry =>
    drafts[`${activeIssue}:${page}`] || myPages[String(page)] || emptyEntry();

  useEffect(() => {
    let cancelled = false;
    setSpans(null);
    setLoadError("");
    setFullscreen(null);
    setReplyingTo(null);
    getIssuePageSpans(activeIssue)
      .then((list) => { if (!cancelled) setSpans(list); })
      .catch((err) => { if (!cancelled) setLoadError(err?.message || "The issue pages could not be loaded."); });
    return () => { cancelled = true; };
  }, [activeIssue]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  const commit = (page: number, next: IssueAssessmentEntry) => {
    const entry = { ...next, bullets: next.bullets.map((line) => line.trim()).filter(Boolean), updatedAt: new Date().toISOString() };
    setDrafts((current) => ({ ...current, [`${activeIssue}:${page}`]: entry }));
    onSubmit({ issueKey: activeIssue, page, entry });
  };

  const openFullscreen = (span: IssuePageSpan) => {
    getIssuePageImage(activeIssue, span.pdfPage, FULLSCREEN_WIDTH)
      .then((url) => {
        setFullscreen({ span, url });
        // Real full screen, not just a large modal, when the browser allows it.
        requestAnimationFrame(() => {
          overlay.current?.requestFullscreen?.().catch(() => {});
        });
      })
      .catch(() => setLoadError("This page could not be enlarged."));
  };

  // Whole-issue statistics: one average per question plus how many pages each
  // member has covered, so the leads can see both quality and participation.
  const summary = useMemo(() => {
    if (!canSeeSummaries) return null;
    const perQuestion = ASSESSMENT_QUESTIONS.map((question) => {
      const values: number[] = [];
      Object.values(board).forEach((byPage) => {
        Object.values(byPage).forEach((entry) => values.push(entry?.[question.key] ?? 0));
      });
      return { ...question, ...average(values) };
    });
    const raters = Object.entries(board)
      .map(([email, byPage]) => ({ email, pages: Object.keys(byPage || {}).length }))
      .filter((rater) => rater.pages > 0)
      .sort((a, b) => b.pages - a.pages);
    const overall = average(perQuestion.map((q) => q.score).filter((score) => score > 0));
    return { perQuestion, raters, overall };
  }, [board, canSeeSummaries]);

  const rows = spans || [];

  return (
    <section className="bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800 rounded-xl sm:rounded-2xl shadow-sm overflow-hidden text-left">
      {/* Header */}
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-neutral-50 to-neutral-100/50 dark:from-neutral-800 dark:to-neutral-800/60 border-b border-neutral-150 dark:border-neutral-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="p-1.5 bg-brand-maroon/10 rounded-xl text-brand-maroon shrink-0">
            <BarChart3 className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-sans font-black text-sm sm:text-base text-stone-900 dark:text-neutral-100 tracking-tight">
              Issue Assessment
            </h2>
            <p className="text-[10px] sm:text-[11px] text-stone-500 dark:text-neutral-400 font-medium">
              Answer each question for every page of the issue — 5 is the strongest, 1 the weakest.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {ISSUES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setActiveIssue(entry.key)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold cursor-pointer transition-all border ${
                activeIssue === entry.key
                  ? "bg-brand-maroon text-white border-brand-maroon shadow-sm"
                  : "bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:border-brand-maroon/40"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lead-only summary of the whole issue */}
      {summary && (
        <div className="px-4 sm:px-6 py-4 border-b border-neutral-150 dark:border-neutral-700 bg-neutral-50/60 dark:bg-neutral-800/40">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-brand-maroon dark:text-brand-maroon-light">
              Issue {issue.label} summary
            </span>
            <div className="flex items-center gap-3 text-[10px] sm:text-[11px] font-bold text-neutral-600 dark:text-neutral-300">
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> {summary.raters.length} rater{summary.raters.length === 1 ? "" : "s"}
              </span>
              {summary.overall.count > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-500" fill="currentColor" />
                  {summary.overall.score.toFixed(2)} overall
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {summary.perQuestion.map((question) => (
              <div key={question.key} className="bg-white dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-700 rounded-xl px-3 py-2">
                <p className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 truncate">
                  {question.label}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="font-sans font-black text-sm text-stone-900 dark:text-neutral-100">
                    {question.count ? question.score.toFixed(2) : "Not rated yet"}
                    {question.count > 0 && <span className="text-[10px] font-semibold text-neutral-400 ml-1">/ 5</span>}
                  </span>
                  {question.count > 0 && (
                    <span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400">
                      {question.count} rating{question.count === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {summary.raters.length > 0 && (
            <p className="mt-2.5 text-[10px] text-neutral-500 dark:text-neutral-400 font-medium">
              {summary.raters.map((rater) => `${memberLabel(rater.email, members)} (${rater.pages} pages)`).join(" · ")}
            </p>
          )}
        </div>
      )}

      {loadError && (
        <div className="mx-4 sm:mx-6 my-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-bold text-rose-700 dark:text-rose-300">{loadError}</p>
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-rose-700 dark:text-rose-300 underline cursor-pointer"
            >
              Open issue {issue.label} in Drive <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Assessment table */}
      <div className="overflow-x-auto">
        {!rows.length && !loadError ? (
          <div className="px-6 py-14 flex flex-col items-center gap-2 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-maroon" />
            <p className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Loading issue {issue.label}</p>
            <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
              The published PDF is downloaded once, then every page is drawn from it.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[900px] text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50/80 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-700">
                <th rowSpan={2} scope="col" className="px-4 sm:px-6 py-3 align-middle text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 w-[190px]">
                  Issue Page
                </th>
                <th colSpan={ASSESSMENT_QUESTIONS.length} scope="colgroup" className="px-3 py-2 align-middle text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-brand-maroon dark:text-brand-maroon-light border-l border-neutral-200 dark:border-neutral-700">
                  Assessment
                </th>
                <th rowSpan={2} scope="col" className="px-4 sm:px-6 py-3 align-middle text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 border-l border-neutral-200 dark:border-neutral-700 min-w-[280px]">
                  Other Comments
                </th>
              </tr>
              <tr className="bg-neutral-50/80 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-700">
                {ASSESSMENT_QUESTIONS.map((question, index) => (
                  <th key={question.key} scope="col" className={`px-3 py-2 text-left align-bottom min-w-[150px] ${index === 0 ? "border-l border-neutral-200 dark:border-neutral-700" : ""}`}>
                    <span className="block text-[10px] sm:text-[11px] font-bold text-neutral-700 dark:text-neutral-200">{question.label}</span>
                    <span className="block text-[9px] sm:text-[10px] font-medium text-neutral-500 dark:text-neutral-400 leading-snug">{question.question}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((span) => {
                const page = span.pdfPage;
                const entry = entryFor(page);
                const pageKey = String(page);
                const pageRatings = Object.values(board)
                  .map((byPage) => byPage?.[pageKey])
                  .filter(Boolean) as IssueAssessmentEntry[];
                // Everyone else's notes for this page, oldest author first, so the
                // leads read the page's feedback per page rather than per issue.
                const others = Object.entries(board)
                  .filter(([email]) => email !== myEmail)
                  .map(([email, byPage]) => ({ email, entry: byPage?.[pageKey] }))
                  .filter((row) => (row.entry?.bullets?.length || 0) > 0 || row.entry?.reply)
                  .sort((a, b) => (a.email > b.email ? 1 : -1));

                return (
                  <tr key={page} className="border-b border-neutral-100 dark:border-neutral-800 align-middle hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                    <th scope="row" className="px-4 sm:px-6 py-3 font-normal">
                      <div className="flex items-center gap-2.5">
                        <PagePicture issueKey={activeIssue} page={page} width={THUMB_WIDTH} onOpen={() => openFullscreen(span)} />
                        <div className="min-w-0">
                          <span className="block font-sans font-black text-xs sm:text-sm text-stone-900 dark:text-neutral-100">
                            {pageSpanLabel(span)}
                          </span>
                          <span className="block text-[9px] text-neutral-400 dark:text-neutral-500 font-semibold uppercase tracking-wide">
                            {span.spread ? "Two-page spread" : "Single page"} · sheet {page} of issue {issue.label}
                          </span>
                        </div>
                      </div>
                    </th>
                    {ASSESSMENT_QUESTIONS.map((question, index) => (
                      <td key={question.key} className={`px-3 py-3 align-top ${index === 0 ? "border-l border-neutral-100 dark:border-neutral-800" : ""}`}>
                        <StarPicker
                          label={`${question.label} for ${pageSpanLabel(span)}`}
                          value={entry[question.key]}
                          onChange={(stars) => commit(page, { ...entry, [question.key]: stars })}
                        />
                        {canSeeSummaries && (
                          <div className="mt-1">
                            <ScoreReadout {...average(pageRatings.map((rating) => rating[question.key]))} />
                          </div>
                        )}
                      </td>
                    ))}
                    <td className="px-4 sm:px-6 py-3 border-l border-neutral-100 dark:border-neutral-800 align-top">
                      <BulletList
                        bullets={entry.bullets.length ? entry.bullets : [""]}
                        onChange={(next) => setDrafts((current) => ({
                          ...current,
                          [`${activeIssue}:${page}`]: { ...entry, bullets: next }
                        }))}
                        onCommit={(next) => commit(page, { ...entry, bullets: next })}
                      />
                      {/* The member sees the lead's answer to their own notes. */}
                      {entry.reply && (
                        <div className="mt-2 flex items-start gap-1.5 pl-3 border-l-2 border-brand-maroon/40">
                          <CornerDownRight className="w-3 h-3 mt-0.5 text-brand-maroon/70 shrink-0" />
                          <p className="text-[10px] sm:text-[11px] leading-snug text-neutral-700 dark:text-neutral-200">
                            <span className="font-bold">{memberLabel(entry.reply.by, members)} replied:</span> {entry.reply.text}
                          </p>
                        </div>
                      )}

                      {canSeeSummaries && others.length > 0 && (
                        <div className="mt-3 space-y-2.5 pt-2.5 border-t border-neutral-200/70 dark:border-neutral-700">
                          {others.map((other) => (
                            <div key={other.email}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                                  {memberLabel(other.email, members)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setReplyingTo(replyingTo === `${page}:${other.email}` ? null : `${page}:${other.email}`)}
                                  className="text-[9px] sm:text-[10px] font-bold text-brand-maroon dark:text-brand-maroon-light hover:underline cursor-pointer"
                                >
                                  {other.entry?.reply ? "Edit response" : "Respond"}
                                </button>
                              </div>
                              <ul className="mt-1 space-y-0.5 list-disc list-inside">
                                {(other.entry?.bullets || []).map((line, i) => (
                                  <li key={i} className="text-[10px] sm:text-[11px] leading-snug text-neutral-700 dark:text-neutral-200">{line}</li>
                                ))}
                              </ul>
                              {other.entry?.reply && (
                                <p className="mt-1 flex items-start gap-1 text-[10px] leading-snug text-brand-maroon dark:text-brand-maroon-light font-semibold">
                                  <CornerDownRight className="w-3 h-3 mt-0.5 shrink-0" />
                                  <span>You replied: {other.entry.reply.text}</span>
                                </p>
                              )}
                              {replyingTo === `${page}:${other.email}` && (
                                <ReplyBox
                                  initial={other.entry?.reply?.text || ""}
                                  onCancel={() => setReplyingTo(null)}
                                  onSend={(text) => {
                                    setReplyingTo(null);
                                    onReply({
                                      issueKey: activeIssue,
                                      memberEmail: other.email,
                                      page,
                                      reply: text
                                        ? { text, by: myEmail, at: new Date().toISOString() }
                                        : null
                                    });
                                  }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-4 sm:px-6 py-3 bg-neutral-50/70 dark:bg-neutral-800/40 border-t border-neutral-150 dark:border-neutral-700 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] sm:text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
          {canSeeSummaries
            ? "Ratings save as you set them. Comments and responses stay on the page they belong to."
            : "Ratings and notes save as you set them — only your own notes are listed here, plus any response to them."}
        </p>
        <a
          href={issue.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-brand-maroon dark:text-brand-maroon-light hover:underline cursor-pointer"
        >
          Issue {issue.label} on Drive <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Full-screen page viewer */}
      {fullscreen && (
        <div
          ref={overlay}
          className="fixed inset-0 z-[60] bg-black/92 flex flex-col items-center justify-center p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Issue ${issue.label} ${pageSpanLabel(fullscreen.span)} in full screen`}
        >
          <div className="w-full flex items-center justify-between gap-3 mb-2">
            <span className="font-sans font-black text-white text-sm sm:text-base">
              Issue {issue.label} — {pageSpanLabel(fullscreen.span)}
            </span>
            <button
              type="button"
              onClick={() => {
                if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
                setFullscreen(null);
              }}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              aria-label="Close full-screen page"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <img
            src={fullscreen.url}
            alt={`Issue ${issue.label} ${pageSpanLabel(fullscreen.span)}`}
            className="max-h-[calc(100vh-90px)] w-auto max-w-full object-contain rounded-lg bg-white"
          />
        </div>
      )}
    </section>
  );
}

function ReplyBox({
  initial, onSend, onCancel
}: { initial: string; onSend: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  return (
    <div className="mt-1.5 space-y-1.5">
      <textarea
        value={text}
        rows={2}
        autoFocus
        placeholder="Answer this member's notes on the page"
        onChange={(event) => setText(event.target.value)}
        className="w-full px-2.5 py-1.5 rounded-lg border border-brand-maroon/40 bg-white dark:bg-neutral-800 text-[11px] text-neutral-800 dark:text-neutral-200 outline-none focus:ring-1 focus:ring-brand-maroon resize-y"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSend(text.trim())}
          className="px-2.5 py-1 rounded-lg bg-brand-maroon text-white text-[10px] font-bold hover:bg-brand-maroon-dark cursor-pointer"
        >
          Send response
        </button>
        {initial ? (
          <button
            type="button"
            onClick={() => onSend("")}
            className="px-2 py-1 rounded-lg text-[10px] font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
          >
            Delete
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 rounded-lg text-[10px] font-bold text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
