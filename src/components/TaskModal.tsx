// The article detail: stage history, the single artx link, the SE's production pings and
// the chat the writer and the editors share. The composer mirrors MKuLayout's task chat —
// multiline, Ctrl+Enter to post, closed once the article is finished.
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Image as ImageIcon, LayoutTemplate, Link2, Send, Sparkles } from "lucide-react";
import { Account, ArtxTask, ordinal, stageLabel } from "../types";
import { NewsState, addComment, mutate, newId } from "../lib/store";
import { ActionKey, MKULAYOUT_URL, actionsFor, holderLabel, isEditorial, seReviewerEmail, sendProductionPing } from "../lib/workflow";
import { Button, Field, INPUT, LABEL, Modal, Panel, Pill, releaseDateLabel } from "./ui";

function toneFor(action: { tone: string }): string {
  return action.tone === "primary" ? "primary" : action.tone === "pass" ? "pass" : action.tone === "warn" ? "warn" : "ghost";
}

export default function TaskModal({ task, viewer, state, onClose, onAct }: {
  task: ArtxTask;
  viewer: Account;
  state: NewsState;
  onClose: () => void;
  onAct: (task: ArtxTask, key: ActionKey, note?: string) => void;
}) {
  const live = state.tasks.find((t) => t.id === task.id) || task;
  const [draft, setDraft] = useState("");
  const [editingLink, setEditingLink] = useState(false);
  const [linkValue, setLinkValue] = useState(live.artxLink);
  const listRef = useRef<HTMLDivElement | null>(null);
  const messages = state.comments.filter((c) => c.taskId === live.id).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const closed = live.stage === "published" || live.stage === "shelved" || live.archived;
  const isLead = isEditorial(viewer.role);
  const moves = actionsFor(state, viewer, live);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const post = () => {
    const text = draft.trim();
    if (!text) return;
    mutate((draftState) => addComment(draftState, {
      taskId: live.id, authorName: viewer.name, authorEmail: viewer.email, authorRole: viewer.role, text,
    }));
    setDraft("");
  };

  const saveLink = () => {
    mutate((s) => {
      s.tasks = s.tasks.map((t) => (t.id === live.id
        ? { ...t, artxLink: linkValue.trim(), updatedAt: new Date().toISOString() }
        : t));
    });
    setEditingLink(false);
  };

  return (
    <Modal title={live.title} onClose={onClose} wide>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Pill tone="maroon">{live.kind === "news-feat" ? "News Feat" : live.kind === "shortform" ? "Shortform" : "News Article"}</Pill>
        <Pill tone="blue">{stageLabel(live)}</Pill>
        {live.stage === "se" && <Pill tone="gray">{ordinal(live.seRound)} editing tier</Pill>}
        {live.sameDay && <Pill tone="amber">Same-day · 2 tiers</Pill>}
        {!closed && <Pill tone="cyan">With {holderLabel(state, live)}</Pill>}
        <Pill tone="gray">{live.priority} Priority</Pill>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] sm:text-xs">
        <div>
          <span className={LABEL}>Writer</span>
          <span className="font-bold text-gray-800 dark:text-neutral-200">{live.writerName}</span>
        </div>
        <div>
          <span className={LABEL}>Target posting date</span>
          <span className="font-bold text-gray-800 dark:text-neutral-200">{releaseDateLabel(live.releaseDate) || "Not set"}</span>
        </div>
        <div className="sm:col-span-2">
          <span className={LABEL}>Artx document</span>
          {editingLink ? (
            <div className="flex items-center gap-2">
              <input className={INPUT} value={linkValue} onChange={(e) => setLinkValue(e.target.value)} placeholder="https://docs.google.com/…" aria-label="Artx document link" />
              <Button onClick={saveLink}><CheckCircle2 className="w-3.5 h-3.5" /> Save</Button>
              <Button tone="ghost" onClick={() => { setEditingLink(false); setLinkValue(live.artxLink); }}>Cancel</Button>
            </div>
          ) : live.artxLink ? (
            <a href={live.artxLink} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] sm:text-[11px] text-brand-maroon dark:text-red-400 hover:underline break-all flex items-start gap-1">
              <Link2 className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {live.artxLink} <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
            </a>
          ) : (
            <p className="text-[11px] text-gray-400 dark:text-neutral-500 italic">No link yet.</p>
          )}
          {isLead && !editingLink && (
            <button type="button" onClick={() => setEditingLink(true)} className="text-[10px] font-bold text-brand-maroon dark:text-red-400 mt-1 cursor-pointer">
              {live.artxLink ? "Change link" : "Add artx link"}
            </button>
          )}
        </div>
        {live.angleText && (
          <div className="sm:col-span-2">
            <span className={LABEL}>Pitch angle</span>
            <p className="text-[11px] text-gray-700 dark:text-neutral-300">{live.angleText}</p>
          </div>
        )}
        {live.outlineLink && (
          <div className="sm:col-span-2">
            <span className={LABEL}>Outline</span>
            <a href={live.outlineLink} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] sm:text-[11px] text-brand-maroon dark:text-red-400 hover:underline break-all">
              {live.outlineLink}
            </a>
          </div>
        )}
      </div>

      {live.stage === "layout" && (
        <Panel title="4LO — online pub task in MKuLayout" className="bg-cyan-50/60 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800">
          <p className="text-[11px] text-gray-700 dark:text-neutral-300">
            {live.layoutHandoff?.confirmed
              ? `Layout confirmed this as an online task${live.layoutHandoff.note ? `: ${live.layoutHandoff.note}` : ""}.`
              : "News handed this to the Layout Deputy as a request for an online pub task. It stays at 4LO until Layout confirms it on their board."}
          </p>
          <a href={MKULAYOUT_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-maroon dark:text-red-400 hover:underline">
            Open MKuLayout <ExternalLink className="w-3 h-3" />
          </a>
        </Panel>
      )}

      <div className="space-y-2">
        <span className={LABEL}>{isLead ? "Stage moves" : "Your moves"}</span>
        {moves.length === 0 && <p className="text-[11px] text-gray-400 dark:text-neutral-500 italic">Nothing to do here until this article comes back to you.</p>}
        {moves.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {moves.map((m) => (
                <Button key={m.key} tone={toneFor(m) as any} onClick={() => {
                  if (!m.needsNote) return onAct(live, m.key);
                  const text = window.prompt(`Note for "${m.label}" (posts to the chat):`) || "";
                  if (!text) return;
                  onAct(live, m.key, text);
                }}>{m.label}</Button>
              ))}
            </div>
          </div>
        )}
        {isLead && live.stage === "se" && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-neutral-500">Section editor options</span>
            <Button tone="ghost" onClick={() => sendProductionPing(live, viewer, "illustration")}>
              <ImageIcon className="w-3.5 h-3.5" /> Ping Illustration Editor
            </Button>
            <Button tone="ghost" onClick={() => sendProductionPing(live, viewer, "iskotistiks")}>
              <Sparkles className="w-3.5 h-3.5" /> Ping Layout for iskotistiks
            </Button>
            <Button tone="ghost" disabled={seReviewerEmail(state, live.kind, live.seRound) === viewer.email} onClick={() => {
              const reviewer = seReviewerEmail(state, live.kind, live.seRound);
              mutate((s) => addComment(s, {
                taskId: live.id, authorName: viewer.name, authorEmail: viewer.email, authorRole: viewer.role,
                text: `Looped in the ${ordinal(live.seRound)}SE.`,
              }));
            }}>
              <LayoutTemplate className="w-3.5 h-3.5" /> Loop in this tier's SE
            </Button>
            {(!state.contacts.illustrationEditorEmail || !state.contacts.layoutEditorEmail) && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300 w-full">
                No {(state.contacts.illustrationEditorEmail && "Layout") || (state.contacts.layoutEditorEmail && "Illustration") || "Layout or Illustration"} Editor
                address is set in Settings, so a ping is recorded on this card but no one outside News is notified.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        <span className={LABEL}>Stage history</span>
        <ol className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
          {[...live.history].reverse().map((h, i) => (
            <li key={`${h.at}-${i}`} className="text-[11px] flex items-start gap-2">
              <Pill tone="gray" className="shrink-0">{stageLabel({ stage: h.stage, seRound: h.seRound ?? live.seRound })}</Pill>
              <span className="text-gray-700 dark:text-neutral-300">
                <span className="font-bold">{h.byName}</span> {h.action}
                {h.note && <span className="text-gray-500 dark:text-neutral-400"> — {h.note}</span>}
              </span>
              <span className="text-gray-400 dark:text-neutral-500 ml-auto shrink-0">{new Date(h.at).toLocaleDateString()}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-2.5 pt-1 border-t border-gray-100 dark:border-neutral-800">
        <span className={LABEL}>Article chat</span>
        <div ref={listRef} className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {messages.length === 0 && <p className="text-[11px] text-gray-400 dark:text-neutral-500 italic">No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`rounded-xl border p-2.5 text-[11px] sm:text-xs space-y-1 ${
              m.isSystem
                ? "bg-neutral-50 dark:bg-neutral-900/60 border-neutral-200 dark:border-neutral-700"
                : m.authorEmail === viewer.email
                  ? "bg-brand-maroon/5 dark:bg-brand-maroon/15 border-brand-maroon/15 dark:border-brand-maroon/30"
                  : "bg-white dark:bg-neutral-800 border-gray-200 dark:border-neutral-700"
            }`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-gray-900 dark:text-neutral-100">{m.authorName} <span className="font-normal text-gray-400 dark:text-neutral-500">· {m.authorRole}</span></span>
                <span className="text-[10px] text-gray-400 dark:text-neutral-500 shrink-0">{new Date(m.timestamp).toLocaleString()}</span>
              </div>
              <p className="whitespace-pre-wrap text-gray-800 dark:text-neutral-200">{m.text}</p>
            </div>
          ))}
        </div>

        {closed ? (
          <div className="pt-1 text-center space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wide">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {live.stage === "published" ? "Published — chat ended" : "Article closed — chat ended"}
            </span>
            <p className="text-[9px] text-gray-400 dark:text-neutral-500">Reopen the article to write here again.</p>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); post(); } }}
              placeholder="Post a note for the desk... (Ctrl+Enter to send)"
              className="flex-1 px-3 py-2 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs focus:ring-2 focus:ring-brand-maroon bg-white dark:bg-neutral-800 text-gray-800 dark:text-neutral-100 outline-none resize-none"
              aria-label="Message"
            />
            <Button onClick={post} disabled={!draft.trim()} className="self-stretch"><Send className="w-4 h-4" /></Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
