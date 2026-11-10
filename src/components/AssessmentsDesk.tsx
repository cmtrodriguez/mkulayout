// Assessment desks. The monthly desk is the News Editor rating a member against guide
// questions; the semestral desk is the same instrument turned around, so members rate the
// Editor. Either sheet is visible only to the person who filled it in and the person it is
// about — the same rule the layout issue assessment follows.
import { useEffect, useState } from "react";
import { Account, Assessment, EDITOR_QUESTIONS, NEWS_QUESTIONS } from "../types";
import { NewsState, mutate, nameOf, newId } from "../lib/store";
import { saveAssessment } from "../lib/cloud";
import { CLOUD_ENABLED } from "../lib/supabase";
import { isAdmin } from "../lib/workflow";
import { Button, Desk, Empty, LABEL, Panel, Pill, Stars, monthPeriod } from "./ui";

const DESK_TITLE = "Section assessment";
const DESK_NOTE = "Guide questions on a five-point scale, with room for comments at the end.";

export default function AssessmentsDesk({ viewer, state }: { viewer: Account; state: NewsState }) {
  const isNewsEditor = viewer.role === "News Editor";
  // The Editor rates members monthly; members rate the Editor once per semester.
  const tab: "monthly" | "semestral" = isNewsEditor ? "monthly" : "semestral";
  const newsEditor = state.accounts.find((a) => a.role === "News Editor");
  const newsEditorName = newsEditor?.name || "the News Editor";

  const periods = isNewsEditor
    ? [monthPeriod(), monthPeriod(new Date(Date.now() - 30 * 86400000)), monthPeriod(new Date(Date.now() - 60 * 86400000))]
    : ["Sem 1", "Sem 2"];
  const [period, setPeriod] = useState(periods[0]);

  // The Admin oversees the desk and is nobody's rater or ratee.
  const subjects = isNewsEditor
    ? state.accounts.filter((a) => a.email !== viewer.email && !isAdmin(a.role))
    : [newsEditor].filter(Boolean) as Account[];
  const [subjectEmail, setSubjectEmail] = useState(subjects[0]?.email || "");

  const questions = tab === "monthly" ? NEWS_QUESTIONS : EDITOR_QUESTIONS;
  const saved = state.assessments.find((a) =>
    a.kind === tab && a.period === period && a.raterEmail === viewer.email && a.subjectEmail === subjectEmail
  ) || null;
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState("");

  // A saved sheet becomes the starting point whenever the period or the target changes;
  // anything typed after that stays local until Save.
  useEffect(() => {
    setScores(saved?.scores || {});
    setComments(saved?.comments || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, period, subjectEmail]);

  const select = (email: string) => setSubjectEmail(email);

  const [rejected, setRejected] = useState("");

  const save = () => {
    const entry: Assessment = {
      id: saved?.id || newId("asmt"),
      kind: tab, period, raterEmail: viewer.email, subjectEmail,
      scores, comments, updatedAt: new Date().toISOString(),
    };
    mutate((draft) => {
      draft.assessments = [...draft.assessments.filter((a) => a.id !== entry.id), entry];
    });
    // The sheet goes to its own table, never into the shared board document, so
    // row-level security is what decides who can read it.
    if (CLOUD_ENABLED) void saveAssessment(entry).then(setRejected);
  };

  const readable = state.assessments.filter((a) =>
    a.subjectEmail.toLowerCase() === viewer.email.toLowerCase() || a.raterEmail.toLowerCase() === viewer.email.toLowerCase()
  );

  // Every hook has run by here, so the Admin's shorter desk can return early.
  if (isAdmin(viewer.role)) {
    return (
      <Desk title={DESK_TITLE} note={DESK_NOTE}>
        <Panel>
          <Empty text="The Admin oversees the desk and files no sheet. The News Editor rates members monthly; members rate the News Editor each semester." />
        </Panel>
      </Desk>
    );
  }

  return (
    <Desk title={DESK_TITLE} note={DESK_NOTE}>
      <div className="flex flex-wrap items-center gap-2">
        <select className="px-3 py-1.5 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs bg-white dark:bg-neutral-800" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {periods.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {isNewsEditor && subjects.length > 0 && (
          <select className="px-3 py-1.5 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs bg-white dark:bg-neutral-800" value={subjectEmail} onChange={(e) => select(e.target.value)}>
            {subjects.map((a) => <option key={a.email} value={a.email}>{a.name} — {a.role}</option>)}
          </select>
        )}
        {!isNewsEditor && <Pill tone="maroon">Rating {newsEditorName}</Pill>}
      </div>

      {subjectEmail && (
        <Panel title={tab === "monthly" ? `${nameOf(state, subjectEmail)} · ${period}` : `${newsEditorName} · ${period}`}>
          <ul className="space-y-3.5">
            {questions.map((q) => (
              <li key={q.key} className="space-y-1.5">
                <span className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-neutral-100">{q.label}</span>
                <p className="text-[11px] text-gray-500 dark:text-neutral-400">{q.question}</p>
                <Stars
                  value={scores[q.key] || 0}
                  label={q.label}
                  onChange={(n) => setScores((prev) => ({ ...prev, [q.key]: n }))}
                />
              </li>
            ))}
          </ul>
          <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-neutral-800">
            <span className={LABEL}>Additional comments</span>
            <textarea
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs bg-white dark:bg-neutral-800 resize-y"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="What went well this period, and what to work on next."
            />
          </div>
          {rejected && (
            <p role="alert" className="text-[11px] text-rose-700 dark:text-rose-300">
              Supabase refused this sheet: {rejected}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[10px] text-gray-400 dark:text-neutral-500">
              {saved ? `Saved ${new Date(saved.updatedAt).toLocaleString()}` : "Not saved yet"} · only you and {tab === "monthly" ? nameOf(state, subjectEmail) : newsEditorName} can read this sheet.
            </p>
            <Button onClick={save} disabled={!Object.keys(scores).length}>Save assessment</Button>
          </div>
        </Panel>
      )}

      <Panel title="Sheets you can see">
        {readable.length === 0 ? <Empty text="No assessments recorded for you yet." /> : (
          <ul className="space-y-1.5">
            {readable.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-[11px] sm:text-xs border border-gray-100 dark:border-neutral-800 rounded-xl p-2.5">
                <span className="truncate">
                  <span className="font-bold text-gray-900 dark:text-neutral-100">{a.kind === "monthly" ? "Monthly" : "Semestral"} · {a.period}</span>
                  <span className="text-gray-500 dark:text-neutral-400"> — {nameOf(state, a.raterEmail)} on {nameOf(state, a.subjectEmail)}</span>
                </span>
                <span className="shrink-0 flex items-center gap-1.5">
                  <Pill tone="blue">{Math.round(Object.values(a.scores).reduce((s, n) => s + n, 0) / Math.max(1, Object.keys(a.scores).length) * 10) / 10} avg</Pill>
                  {a.raterEmail.toLowerCase() === viewer.email.toLowerCase() && <Pill tone="gray">Yours</Pill>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Desk>
  );
}
