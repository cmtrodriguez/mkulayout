// The pitch bank. Anyone — inside News or not — may post a topic at any time; members see
// what is free to grab, and grabbing it tells that writer's section editor, which is what
// starts the pitch-with-angle consultation. Pitches leave the open list when grabbed and
// leave the bank entirely once the article publishes.
import { useState } from "react";
import { Ban, Check, ExternalLink, Plus, Users } from "lucide-react";
import { Account, ASSOCIATE_EDITOR_NAME, NEWS_EDITOR_NAME, Pitch } from "../types";
import { NewsState, mutate, nameOf, newId, pushNotification } from "../lib/store";
import { createPitch, grabPitch, isEditorial, openArticleFromPitch } from "../lib/workflow";
import { Button, Desk, Empty, Field, INPUT, Modal, Panel, Pill, todayISO } from "./ui";

export default function PitchDesk({ viewer, state, onOpenTask }: {
  viewer: Account;
  state: NewsState;
  onOpenTask: (taskId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [converting, setConverting] = useState<Pitch | null>(null);
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<"news-article" | "news-feat">("news-article");
  const isLead = isEditorial(viewer.role);

  const open = state.pitches.filter((p) => p.status === "open");
  const mine = state.pitches.filter((p) => p.grabbedBy?.toLowerCase() === viewer.email.toLowerCase() && p.status !== "converted");
  const grabbed = state.pitches.filter((p) => p.status === "grabbed");
  const settled = state.pitches.filter((p) => p.status === "converted" || p.status === "declined");

  const submitPitch = () => {
    if (!topic.trim()) return;
    mutate((draft) => createPitch(draft, { topic, notes, kind, sourceName: viewer.name, sourceEmail: viewer.email }));
    setTopic(""); setNotes(""); setAdding(false);
  };

  const decline = (pitch: Pitch) => {
    const reason = window.prompt(`Why is this pitch being declined?`) || "";
    if (!reason) return;
    mutate((draft) => {
      draft.pitches = draft.pitches.map((p) => (p.id === pitch.id ? { ...p, status: "declined", declinedReason: reason } : p));
      pushNotification(draft, {
        title: `Pitch declined — ${pitch.topic}`, message: reason, type: "pitch",
        targetEmails: [pitch.sourceEmail, pitch.grabbedBy || ""],
      });
    });
  };

  return (
    <Desk title="Pitch bank" note="Topics from anyone, grabbed by whoever will write them.">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setAdding(true)}><Plus className="w-3.5 h-3.5" /> Pitch a topic</Button>
        <Pill tone="gray">{open.length} for grabs</Pill>
        <Pill tone="blue">{grabbed.length} grabbed</Pill>
      </div>

      <Panel title="For grabs">
        {open.length === 0 ? <Empty text="No open pitches right now." /> : (
          <ul className="space-y-2">
            {open.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 border border-gray-100 dark:border-neutral-800 rounded-xl p-2.5 bg-white dark:bg-neutral-900">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Pill tone="maroon">{p.kind === "news-feat" ? "News Feat" : "News Article"}</Pill>
                    <span className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-neutral-100">{p.topic}</span>
                  </div>
                  {p.notes && <p className="text-[11px] text-gray-500 dark:text-neutral-400">{p.notes}</p>}
                  <p className="text-[10px] text-gray-400 dark:text-neutral-500">Pitched by {p.sourceName} · {new Date(p.createdAt).toLocaleDateString()}</p>
                </div>
                <Button tone="pass" onClick={() => grabPitch(p, viewer)} disabled={!!mine.find((m) => m.id === p.id)}>
                  <Users className="w-3.5 h-3.5" /> {p.grabbedBy?.toLowerCase() === viewer.email.toLowerCase() ? "Mine" : "Grab"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {mine.length > 0 && (
        <Panel title="Mine">
          <ul className="space-y-2">
            {mine.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 border border-gray-100 dark:border-neutral-800 rounded-xl p-2.5">
                <div className="min-w-0 space-y-1">
                  <span className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-neutral-100">{p.topic}</span>
                  <p className="text-[10px] text-gray-400 dark:text-neutral-500">
                    {p.taskId ? "In the pipeline as an article." : `Awaiting ${p.angle?.status === "approved" ? "outline approval" : "the angle check"} with the ${p.kind === "news-feat" ? ASSOCIATE_EDITOR_NAME : NEWS_EDITOR_NAME}.`}
                  </p>
                </div>
                {p.taskId && <Button tone="ghost" onClick={() => onOpenTask(p.taskId!)}>Open card</Button>}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {isLead && (
        <Panel title="Grabbed pitches">
          {grabbed.length === 0 ? <Empty text="Nothing has been grabbed yet." /> : (
            <ul className="space-y-2">
              {grabbed.map((p) => (
                <li key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-gray-100 dark:border-neutral-800 rounded-xl p-2.5">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Pill tone="maroon">{p.kind === "news-feat" ? "News Feat · 1stSE is the AE" : "News Article"}</Pill>
                      <span className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-neutral-100">{p.topic}</span>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-neutral-400">
                      {p.grabbedByName} · source {p.sourceName}
                      {p.angle?.text ? ` · angle: ${p.angle.text}` : " · no angle submitted yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.taskId ? (
                      <Button tone="ghost" onClick={() => onOpenTask(p.taskId!)}>Open card <ExternalLink className="w-3 h-3" /></Button>
                    ) : (
                      <Button onClick={() => setConverting(p)}><Check className="w-3.5 h-3.5" /> Open artx card</Button>
                    )}
                    <Button tone="ghost" onClick={() => decline(p)}><Ban className="w-3.5 h-3.5" /> Decline</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {settled.length > 0 && (
        <Panel title="Closed out">
          <ul className="space-y-1.5">
            {settled.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-neutral-400">
                <span className="truncate">{p.topic}</span>
                <Pill tone={p.status === "converted" ? "green" : "gray"}>{p.status === "converted" ? "Published" : "Declined"}</Pill>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {adding && (
        <Modal title="Pitch a topic" onClose={() => setAdding(false)}>
          <div className="space-y-3">
            <Field label="Topic">
              <input className={INPUT} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What should News cover?" />
            </Field>
            <Field label="Output">
              <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value as any)}>
                <option value="news-article">News article (longform)</option>
                <option value="news-feat">News feat (longform)</option>
              </select>
            </Field>
            <Field label="Notes">
              <textarea className={INPUT} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, sources, who needs to be interviewed." />
            </Field>
            <div className="flex justify-end gap-2">
              <Button tone="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={submitPitch} disabled={!topic.trim()}>Post to bank</Button>
            </div>
          </div>
        </Modal>
      )}

      {converting && (
        <ConvertModal pitch={converting} viewer={viewer} state={state} onClose={() => setConverting(null)} onOpenTask={onOpenTask} />
      )}
    </Desk>
  );
}

function ConvertModal({ pitch, viewer, state, onClose, onOpenTask }: {
  pitch: Pitch; viewer: Account; state: NewsState; onClose: () => void; onOpenTask: (id: string) => void;
}) {
  const [title, setTitle] = useState(pitch.topic);
  const [writerEmail, setWriterEmail] = useState(pitch.grabbedBy || state.accounts.find((a) => a.role === "News Staffer")?.email || viewer.email);
  const [artxLink, setArtxLink] = useState("");
  const [releaseDate, setReleaseDate] = useState(todayISO());
  const [sameDay, setSameDay] = useState(false);

  const create = () => {
    const writer = state.accounts.find((a) => a.email === writerEmail);
    const task = openArticleFromPitch(pitch, viewer, {
      title, writerEmail, writerName: writer?.name || nameOf(state, writerEmail),
      artxLink, releaseDate, sameDay,
    });
    onClose();
    if (task) onOpenTask(task.id);
  };

  return (
    <Modal title={`Open artx card — ${pitch.topic}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Working title"><input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Writer">
          <select className={INPUT} value={writerEmail} onChange={(e) => setWriterEmail(e.target.value)}>
            {state.accounts.filter((a) => a.active && a.role !== "Editor-In-Chief").map((a) => (
              <option key={a.email} value={a.email}>{a.name} — {a.role}</option>
            ))}
          </select>
        </Field>
        <Field label="Artx Google Doc link" hint="The editor creates the doc, then pastes it here. This is the only workspace link the card carries.">
          <input className={INPUT} value={artxLink} onChange={(e) => setArtxLink(e.target.value)} placeholder="https://docs.google.com/document/d/…" />
        </Field>
        <Field label="Target posting date"><input type="date" className={INPUT} value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-[11px] sm:text-xs text-gray-700 dark:text-neutral-300">
          <input type="checkbox" checked={sameDay} onChange={(e) => setSameDay(e.target.checked)} className="w-4 h-4" />
          Same-day article — two editing tiers only
        </label>
        <div className="flex justify-end gap-2">
          <Button tone="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={create} disabled={!title.trim()}>Create card</Button>
        </div>
      </div>
    </Modal>
  );
}
