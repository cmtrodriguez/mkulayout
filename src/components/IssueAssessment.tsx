import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Star, X, Loader2, AlertCircle, ExternalLink, BarChart3, Users
} from "lucide-react";
import {
  ASSESSMENT_QUESTIONS, IssueAssessmentEntry, IssueAssessments, TeamMember
} from "../types";
import { ISSUES } from "../lib/issues";
import { getIssuePageCount, getIssuePageImage } from "../lib/issuePages";
import { getPreferredFirstName } from "../lib/memberUtils";

interface IssueAssessmentProps {
  assessments: IssueAssessments;
  members: TeamMember[];
  currentUserEmail: string;
  currentUserRole?: string;
  onSubmit: (input: { issueKey: string; page: number; entry: IssueAssessmentEntry }) => void;
}

const THUMB_WIDTH = 170;
const FULLSCREEN_WIDTH = 1500;

const emptyEntry = (): IssueAssessmentEntry => ({
  layout: 0, typography: 0, images: 0, comment: "", updatedAt: new Date().toISOString()
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

export default function IssueAssessment({
  assessments,
  members,
  currentUserEmail,
  currentUserRole,
  onSubmit,
}: IssueAssessmentProps) {
  const [activeIssue, setActiveIssue] = useState(ISSUES[0].key);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [fullscreen, setFullscreen] = useState<{ page: number; url: string } | null>(null);
  const overlay = useRef<HTMLDivElement>(null);

  // Rows are edited locally first, so a member can rate several pages before each
  // write lands; anything absent here falls back to what the board already holds.
  const [drafts, setDrafts] = useState<Record<string, IssueAssessmentEntry>>({});

  const canSeeSummaries = currentUserRole === "Layout Editor" || currentUserRole === "Layout Deputy";
  const myEmail = (currentUserEmail || "").toLowerCase();

  const issue = ISSUES.find((entry) => entry.key === activeIssue)!;
  const board = assessments[activeIssue] || {};
  const myPages = board[myEmail] || {};

  const entryFor = (page: number): IssueAssessmentEntry =>
    drafts[`${activeIssue}:${page}`] || myPages[String(page)] || emptyEntry();

  useEffect(() => {
    let cancelled = false;
    setPageCount(null);
    setLoadError("");
    setFullscreen(null);
    getIssuePageCount(activeIssue)
      .then((count) => { if (!cancelled) setPageCount(count); })
      .catch((err) => { if (!cancelled) setLoadError(err?.message || "The issue pages could not be loaded."); })
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
    const entry = { ...next, updatedAt: new Date().toISOString() };
    setDrafts((current) => ({ ...current, [`${activeIssue}:${page}`]: entry }));
    onSubmit({ issueKey: activeIssue, page, entry });
  };

  const openFullscreen = (page: number) => {
    getIssuePageImage(activeIssue, page, FULLSCREEN_WIDTH)
      .then((url) => {
        setFullscreen({ page, url });
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

  const totalPages = pageCount || 0;

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
              Rate every page of each issue on layout, typography and images — 5 is the strongest, 1 the weakest.
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
        {!pageCount && !loadError ? (
          <div className="px-6 py-14 flex flex-col items-center gap-2 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-brand-maroon" />
            <p className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Loading issue {issue.label}</p>
            <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
              The published PDF is downloaded once, then every page is drawn from it.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[820px] text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50/80 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-700">
                <th rowSpan={2} scope="col" className="px-4 sm:px-6 py-3 align-middle text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 w-[190px]">
                  Issue Page
                </th>
                <th colSpan={ASSESSMENT_QUESTIONS.length} scope="colgroup" className="px-3 py-2 align-middle text-center text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-brand-maroon dark:text-brand-maroon-light border-l border-neutral-200 dark:border-neutral-700">
                  Assessment
                </th>
                <th rowSpan={2} scope="col" className="px-4 sm:px-6 py-3 align-middle text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 border-l border-neutral-200 dark:border-neutral-700 min-w-[240px]">
                  Other Comments
                </th>
              </tr>
              <tr className="bg-neutral-50/80 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-700">
                {ASSESSMENT_QUESTIONS.map((question) => (
                  <th key={question.key} scope="col" className="px-3 py-2 text-left align-bottom">
                    <span className="block text-[10px] sm:text-[11px] font-bold text-neutral-700 dark:text-neutral-200">{question.label}</span>
                    <span className="block text-[9px] font-medium text-neutral-400 dark:text-neutral-500 leading-tight">{question.hint}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => {
                const entry = entryFor(page);
                const pageRatings = Object.values(board)
                  .map((byPage) => byPage?.[String(page)])
                  .filter(Boolean) as IssueAssessmentEntry[];
                const otherComments = Object.entries(board)
                  .flatMap(([email, byPage]) => {
                    const comment = byPage?.[String(page)]?.comment?.trim();
                    return comment && email !== myEmail ? [{ email, comment }] : [];
                  })
                  .sort((a, b) => (a.email > b.email ? 1 : -1));

                return (
                  <tr key={page} className="border-b border-neutral-100 dark:border-neutral-800 align-middle hover:bg-neutral-50/60 dark:hover:bg-neutral-800/40">
                    <th scope="row" className="px-4 sm:px-6 py-3 font-normal">
                      <div className="flex items-center gap-2.5">
                        <PagePicture issueKey={activeIssue} page={page} width={THUMB_WIDTH} onOpen={() => openFullscreen(page)} />
                        <div className="min-w-0">
                          <span className="block font-sans font-black text-xs sm:text-sm text-stone-900 dark:text-neutral-100">Page {page}</span>
                          <span className="block text-[9px] text-neutral-400 dark:text-neutral-500 font-semibold uppercase tracking-wide">of issue {issue.label}</span>
                        </div>
                      </div>
                    </th>
                    {ASSESSMENT_QUESTIONS.map((question) => (
                      <td key={question.key} className="px-3 py-3 border-l border-neutral-100 dark:border-neutral-800">
                        <StarPicker
                          label={`${question.label} for page ${page}`}
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
                    <td className="px-4 sm:px-6 py-3 border-l border-neutral-100 dark:border-neutral-800">
                      <input
                        type="text"
                        value={entry.comment}
                        placeholder="Note what needs fixing on this page"
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [`${activeIssue}:${page}`]: { ...entry, comment: event.target.value }
                        }))}
                        onBlur={(event) => commit(page, { ...entry, comment: event.target.value.trim() })}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[11px] sm:text-xs text-neutral-800 dark:text-neutral-200 outline-none focus:ring-1 focus:ring-brand-maroon"
                      />
                      {canSeeSummaries && otherComments.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {otherComments.map((item) => (
                            <li key={item.email} className="text-[10px] leading-snug text-neutral-600 dark:text-neutral-300">
                              <span className="font-bold text-neutral-800 dark:text-neutral-100">{memberLabel(item.email, members)}:</span>{" "}
                              {item.comment}
                            </li>
                          ))}
                        </ul>
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
            ? "Ratings save as you set them. Summaries and every comment are visible to you as a lead."
            : "Ratings and comments save as you set them — only your own submission is shown here."}
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
          aria-label={`Issue ${issue.label} page ${fullscreen.page} in full screen`}
        >
          <div className="w-full flex items-center justify-between gap-3 mb-2">
            <span className="font-sans font-black text-white text-sm sm:text-base">
              Issue {issue.label} — Page {fullscreen.page}
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
            alt={`Issue ${issue.label} page ${fullscreen.page}`}
            className="max-h-[calc(100vh-90px)] w-auto max-w-full object-contain rounded-lg bg-white"
          />
        </div>
      )}
    </section>
  );
}
