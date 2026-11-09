// Shortform input — News Editor only. Each entry is a writer, a date, a topic and the
// Facebook link; syncing appends that row to the section's Google Sheet through an Apps
// Script Web App, and a row is only marked synced when the script actually accepts it.
import { useState } from "react";
import { RefreshCw, Sheet, Upload } from "lucide-react";
import { Account, ShortformEntry } from "../types";
import { NewsState, mutate, newId } from "../lib/store";
import { SHEETS_URL, syncShortformToSheets } from "../lib/workflow";
import { Button, Desk, Empty, Field, INPUT, Modal, Panel, Pill, todayISO } from "./ui";

export default function ShortformDesk({ viewer, state }: { viewer: Account; state: NewsState }) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ writer: "", date: todayISO(), topic: "", link: "" });
  const isNewsEditor = viewer.role === "News Editor";

  const markSync = (id: string, ok: boolean, message: string) => {
    mutate((draft) => {
      draft.shortform = draft.shortform.map((s) => (s.id === id
        ? { ...s, syncStatus: ok ? "synced" : "failed", syncedAt: ok ? new Date().toISOString() : s.syncedAt, syncError: ok ? "" : message }
        : s));
    });
  };

  const syncOne = async (entry: ShortformEntry) => {
    setBusy(entry.id);
    setError("");
    const res = await syncShortformToSheets({ writer: entry.writerName, date: entry.date, topic: entry.topic, link: entry.link });
    markSync(entry.id, res.ok, res.error);
    if (!res.ok) setError(res.error);
    setBusy("");
  };

  const syncAll = async () => {
    const pending = state.shortform.filter((s) => s.syncStatus !== "synced");
    for (const entry of pending) await syncOne(entry);
  };

  const add = () => {
    if (!form.writer.trim() || !form.topic.trim() || !form.link.trim()) return;
    mutate((draft) => {
      draft.shortform = [{
        id: newId("sf"), writerName: form.writer.trim(), date: form.date, topic: form.topic.trim(),
        link: form.link.trim(), syncStatus: "pending", createdAt: new Date().toISOString(),
      }, ...draft.shortform];
    });
    setForm({ writer: "", date: todayISO(), topic: "", link: "" });
    setAdding(false);
  };

  if (!isNewsEditor) {
    return (
      <Desk title="Shortform input" note="Only the News Editor records shortform outputs.">
        <Panel><Empty text="You do not have access to this desk." /></Panel>
      </Desk>
    );
  }

  const pending = state.shortform.filter((s) => s.syncStatus !== "synced").length;

  return (
    <Desk
      title="Shortform input"
      note="Writer, date, topic and the Facebook link — one row per published shortform."
      actions={<>
        <Button onClick={() => setAdding(true)}><Upload className="w-3.5 h-3.5" /> Add shortform</Button>
        <Button tone="ghost" onClick={syncAll} disabled={!pending || !SHEETS_URL}><RefreshCw className="w-3.5 h-3.5" /> Sync {pending ? `${pending} pending` : "all"}</Button>
      </>}
    >
      {!SHEETS_URL && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
            <Sheet className="w-3.5 h-3.5" /> Sheet sync is not connected
          </p>
          <p className="text-[11px] text-amber-900 dark:text-amber-200">
            Entries are recorded locally and marked pending. Set <code className="font-mono">VITE_SHORTFORM_APPS_SCRIPT_URL</code> to
            an Apps Script Web App that appends <code className="font-mono">[writer, date, topic, link]</code> rows, and Sync writes
            them into the sheet.
          </p>
        </div>
      )}

      {error && <p role="alert" className="text-[11px] text-rose-700 dark:text-rose-300">{error}</p>}

      <Panel title="Recorded shortform">
        {state.shortform.length === 0 ? <Empty text="Nothing recorded yet." /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] sm:text-xs">
              <thead>
                <tr className="text-brand-maroon dark:text-brand-maroon-light">
                  <th className="px-2 py-1.5 text-[10px] uppercase font-black">Writer</th>
                  <th className="px-2 py-1.5 text-[10px] uppercase font-black">Date</th>
                  <th className="px-2 py-1.5 text-[10px] uppercase font-black">Topic</th>
                  <th className="px-2 py-1.5 text-[10px] uppercase font-black">Link</th>
                  <th className="px-2 py-1.5 text-[10px] uppercase font-black">Sheet</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                {state.shortform.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="px-2 py-2 font-bold text-gray-800 dark:text-neutral-200">{s.writerName}</td>
                    <td className="px-2 py-2 text-gray-600 dark:text-neutral-300 whitespace-nowrap">{s.date}</td>
                    <td className="px-2 py-2 text-gray-700 dark:text-neutral-300">{s.topic}</td>
                    <td className="px-2 py-2">
                      <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-brand-maroon dark:text-red-400 hover:underline font-mono text-[10px] line-clamp-1">{s.link}</a>
                    </td>
                    <td className="px-2 py-2">
                      <Pill tone={s.syncStatus === "synced" ? "green" : s.syncStatus === "failed" ? "red" : "gray"}>
                        {s.syncStatus === "synced" ? "Synced" : s.syncStatus === "failed" ? "Failed" : "Pending"}
                      </Pill>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {s.syncStatus !== "synced" && (
                        <Button tone="ghost" onClick={() => syncOne(s)} disabled={!SHEETS_URL || busy === s.id}>
                          {busy === s.id ? "Syncing…" : "Sync row"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {adding && (
        <Modal title="Add shortform" onClose={() => setAdding(false)}>
          <div className="space-y-3">
            <Field label="Writer"><input className={INPUT} value={form.writer} onChange={(e) => setForm({ ...form, writer: e.target.value })} placeholder="Name as it should read in the sheet" /></Field>
            <Field label="Date"><input type="date" className={INPUT} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Topic"><input className={INPUT} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} /></Field>
            <Field label="Link (Facebook)"><input className={INPUT} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://www.facebook.com/…" /></Field>
            <div className="flex justify-end gap-2">
              <Button tone="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button onClick={add} disabled={!form.writer.trim() || !form.topic.trim() || !form.link.trim()}>Record</Button>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-neutral-500">
              Saved as pending{SHEETS_URL ? ". Use Sync to append it to the sheet." : " until the sheet is connected."}
            </p>
          </div>
        </Modal>
      )}
    </Desk>
  );
}
