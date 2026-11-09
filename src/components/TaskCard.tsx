// The article card. Same shape as a MKuLayout assignment card — glass panel, format pill
// top-left, priority pill top-right, bold title that opens the detail, target date, one
// workspace link row, a two-column attribution grid, and a status control at the foot —
// except the link row is only the artx doc and the status control lists the stage moves the
// viewer is actually allowed to make.
import { CalendarDays, ExternalLink, MessageSquare, User } from "lucide-react";
import { Account, ArtxTask, stageLabel } from "../types";
import { NewsState } from "../lib/store";
import { ActionKey, actionsFor, holderLabel, isEditorial } from "../lib/workflow";
import { Pill, releaseDateLabel, isPastDue } from "./ui";

const KIND_LABEL: Record<string, string> = {
  "news-article": "News Article",
  "news-feat": "News Feat",
  shortform: "Shortform",
};

export default function TaskCard({ task, viewer, state, onOpen, onAct }: {
  task: ArtxTask;
  viewer: Account;
  state: NewsState;
  onOpen: (task: ArtxTask) => void;
  onAct: (task: ArtxTask, key: ActionKey, note?: string) => void;
}) {
  const closed = task.stage === "published" || task.stage === "shelved" || task.archived;
  const overdue = !closed && isPastDue(task.releaseDate);
  const moves = actionsFor(state, viewer, task);
  const messages = state.comments.filter((c) => c.taskId === task.id).length;
  const isLead = isEditorial(viewer.role);

  return (
    <div className={`glass-card hover:shadow-md rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border transition-all flex flex-col justify-between space-y-2.5 sm:space-y-4 text-left ${
      closed
        ? "opacity-55 border-gray-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 hover:opacity-90"
        : overdue
          ? "border-red-300 dark:border-red-700 bg-red-50/80 dark:bg-red-950/30"
          : "border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900"
    }`}>
      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <Pill tone="maroon">{KIND_LABEL[task.kind] || task.kind}</Pill>
            <Pill tone={task.stage === "published" ? "green" : task.stage === "shelved" ? "gray" : "blue"}>{stageLabel(task)}</Pill>
            {task.sameDay && <Pill tone="amber">Same-day</Pill>}
            {overdue && <Pill tone="red">Past Due</Pill>}
          </div>
          {!closed && (
            <Pill tone={task.priority === "Urgent" ? "red" : task.priority === "High" ? "amber" : task.priority === "Medium" ? "blue" : "gray"}>
              {task.priority} Priority
            </Pill>
          )}
        </div>

        <h4
          className="font-bold text-gray-950 dark:text-neutral-100 text-xs sm:text-sm leading-snug hover:text-brand-maroon dark:hover:text-red-400 cursor-pointer transition-all"
          onClick={() => onOpen(task)}
        >
          {task.title}
        </h4>

        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-[9px] sm:text-[10px] text-gray-400 dark:text-neutral-400 uppercase font-semibold block">Target posting date</span>
            <span className="text-[11px] sm:text-xs font-bold text-gray-700 dark:text-neutral-200 flex items-center gap-1">
              <CalendarDays className="w-3 h-3 text-brand-maroon dark:text-brand-maroon-light shrink-0" />
              {releaseDateLabel(task.releaseDate) || "Not set"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpen(task)}
            className="text-[10px] sm:text-[11px] font-bold text-gray-500 dark:text-neutral-400 hover:text-brand-maroon flex items-center gap-1 cursor-pointer shrink-0"
            aria-label={`Open the chat for ${task.title}`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> {messages}
          </button>
        </div>

        {task.artxLink ? (
          <div className="bg-cyan-50/60 dark:bg-cyan-950/40 border border-cyan-100 dark:border-cyan-800 p-1.5 sm:p-2 rounded-lg sm:rounded-xl flex items-center justify-between gap-2 text-[10px]">
            <span className="text-cyan-800 dark:text-cyan-300 font-medium truncate block flex-1 font-mono text-[9px] sm:text-[10px]">{task.artxLink}</span>
            <a href={task.artxLink} target="_blank" rel="noopener noreferrer"
               className="px-2 py-0.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-lg text-[9px] flex items-center gap-0.5 shrink-0">
              Artx <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        ) : (
          <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl border border-dashed border-gray-200 dark:border-neutral-700 text-[10px] text-gray-400 dark:text-neutral-500">
            {isLead ? "No artx doc link yet — add one on this card." : "The editor has not added the artx doc link yet."}
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 pt-1.5 sm:pt-2 border-t border-gray-100 dark:border-neutral-800 text-[11px] sm:text-xs">
          <div>
            <span className="text-[9px] sm:text-[10px] text-gray-400 dark:text-neutral-400 uppercase font-semibold block">Writer</span>
            <span className="font-bold text-gray-700 dark:text-neutral-200 truncate block">{task.writerName}</span>
          </div>
          <div>
            <span className="text-[9px] sm:text-[10px] text-gray-400 dark:text-neutral-400 uppercase font-semibold block">On desk</span>
            <span className="font-bold text-gray-700 dark:text-neutral-200 truncate flex items-center gap-1">
              <User className="w-3 h-3 text-brand-maroon dark:text-brand-maroon-light shrink-0" />
              {/* The writer holding their own piece is the normal case; naming them twice
                  next to the Writer cell says nothing new. */}
              <span className="truncate">{closed ? "Closed" : task.custody === "writer" ? "Writer" : holderLabel(state, task)}</span>
            </span>
          </div>
        </div>

        {(task.needsIllustration || task.needsIskotistiks) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {task.needsIllustration && <Pill tone="purple">Illustration requested</Pill>}
            {task.needsIskotistiks && <Pill tone="cyan">Iskotistiks requested</Pill>}
          </div>
        )}
      </div>

      <div className="pt-2 sm:pt-3 border-t border-gray-100 dark:border-neutral-800 flex items-center justify-between gap-2 sm:gap-3 text-xs">
        <div className="min-w-0">
          <span className="text-[9px] text-gray-400 dark:text-neutral-400 font-semibold uppercase block mb-0.5 sm:mb-1">
            {moves.length ? "Move article" : "No move for you right now"}
          </span>
          {moves.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const move = moves.find((m) => m.key === (e.target.value as ActionKey));
                if (!move) return;
                const note = move.needsNote ? window.prompt(`Note for "${move.label}" (goes in the chat):`) || "" : "";
                if (move.needsNote && !note) return;
                onAct(task, move.key, note);
              }}
              className="px-2 sm:px-2.5 py-1 border border-gray-200 dark:border-neutral-700 rounded-lg text-[11px] sm:text-xs outline-none cursor-pointer bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-200 focus:ring-2 focus:ring-brand-maroon max-w-full"
              aria-label={`Move ${task.title}`}
            >
              <option value="" disabled>Select the next step</option>
              {moves.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpen(task)}
          className="px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 hover:text-brand-maroon text-gray-600 dark:text-neutral-300 cursor-pointer shrink-0"
        >
          Open
        </button>
      </div>
    </div>
  );
}
