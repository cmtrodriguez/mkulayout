// Settings: the roster's Google addresses, the Layout-side contacts News hands work to,
// and the template URLs. Leads only.
//
// Sign-in matches on the email in the Supabase session, so an account stays unreachable
// until its real address is entered here — the seeded addresses are patterns, not people.
import { useState } from "react";
import { AlertTriangle, Link2, Plus, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { Account, NEWS_EMAIL_DOMAIN, NewsRole } from "../types";
import { NewsState, mutate, resetDesk } from "../lib/store";
import { CLOUD_ENABLED } from "../lib/supabase";
import { MKULAYOUT_URL, SHEETS_URL, isEditorial } from "../lib/workflow";
import { Button, Desk, Empty, Field, INPUT, LABEL, Panel, Pill } from "./ui";

const ROLES: NewsRole[] = ["News Editor", "Associate Editor", "News Probi", "News Staffer", "Editor-In-Chief"];

export default function SettingsDesk({ viewer, state }: { viewer: Account; state: NewsState }) {
  const leads = isEditorial(viewer.role);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<NewsRole>("News Staffer");

  if (!leads) {
    return (
      <Desk title="Settings" note="Roster, sign-in and link configuration.">
        <Panel>
          <div className="flex items-start gap-2 text-[11px] sm:text-xs text-gray-600 dark:text-neutral-300">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              Section settings are held by the News Editor, the Associate Editor and the Editor-In-Chief.
              Your own weekly availability is edited under Section team.
            </p>
          </div>
        </Panel>
      </Desk>
    );
  }

  const patchAccount = (email: string, patch: Partial<Account>) => {
    mutate((draft) => {
      draft.accounts = draft.accounts.map((a) => (a.email === email ? { ...a, ...patch } : a));
    });
  };

  const patchContact = (key: keyof NewsState["contacts"], value: string) => {
    mutate((draft) => { draft.contacts = { ...draft.contacts, [key]: value.trim() }; });
  };

  const patchLink = (id: string, url: string) => {
    mutate((draft) => { draft.quickLinks = draft.quickLinks.map((l) => (l.id === id ? { ...l, url: url.trim() } : l)); });
  };

  const unconfirmed = state.accounts.filter((a) => !a.emailConfirmed);

  return (
    <Desk title="Settings" note="Roster and sign-in, the Layout-side contacts, and the templates the desk links out to.">
      <Panel title="Roster" right={<Pill tone="gray"><Users className="w-3 h-3 inline mr-1" />{state.accounts.length} accounts</Pill>}>
        {unconfirmed.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-[11px] text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {unconfirmed.length} {unconfirmed.length === 1 ? "account has" : "accounts have"} no verified Google address yet, so those
              people cannot sign in. Enter the address they use and tick it as confirmed.
            </span>
          </div>
        )}
        <div className="space-y-2">
          {state.accounts.map((a, idx) => (
            // Indexed key: the email itself is editable, so keying on it would remount the
            // input mid-typing and drop focus after every character.
            <div key={idx} className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-2.5 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
              <div className="md:col-span-3">
                <span className={LABEL}>Member</span>
                <input className={INPUT} value={a.name} onChange={(e) => patchAccount(a.email, { name: e.target.value })} />
              </div>
              <div className="md:col-span-4">
                <span className={LABEL}>Google email</span>
                <input className={INPUT} value={a.email} onChange={(e) => patchAccount(a.email, { email: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <span className={LABEL}>Role</span>
                <select className={INPUT} value={a.role} disabled={a.email === viewer.email} onChange={(e) => patchAccount(a.email, { role: e.target.value as NewsRole })}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="md:col-span-3 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600 dark:text-neutral-300 cursor-pointer">
                  <input type="checkbox" className="w-3.5 h-3.5 accent-[#bc1700]" checked={a.emailConfirmed} onChange={(e) => patchAccount(a.email, { emailConfirmed: e.target.checked })} />
                  Confirmed
                </label>
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600 dark:text-neutral-300 cursor-pointer">
                  <input type="checkbox" className="w-3.5 h-3.5 accent-[#bc1700]" checked={a.active} onChange={(e) => patchAccount(a.email, { active: e.target.checked })} />
                  Active
                </label>
                {a.email !== viewer.email && (
                  <button
                    onClick={() => {
                      if (!window.confirm(`Remove ${a.name} from the roster? Their articles keep the name on the card.`)) return;
                      mutate((draft) => { draft.accounts = draft.accounts.filter((x) => x.email !== a.email); });
                    }}
                    className="text-[10px] font-bold text-rose-600 hover:text-rose-500 cursor-pointer ml-auto"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-2 border-t border-gray-100 dark:border-neutral-800 items-end">
          <Field label="New member">
            <input className={INPUT} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Google email">
            <input className={INPUT} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={`name.${NEWS_EMAIL_DOMAIN}`} />
          </Field>
          <Field label="Role">
            <select className={INPUT} value={newRole} onChange={(e) => setNewRole(e.target.value as NewsRole)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Button
            disabled={!newName.trim() || !newEmail.includes("@")}
            onClick={() => {
              const email = newEmail.trim();
              mutate((draft) => {
                draft.accounts = [...draft.accounts, { email, name: newName.trim(), role: newRole, emailConfirmed: true, active: true }];
              });
              setNewName("");
              setNewEmail("");
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Add member
          </Button>
        </div>
      </Panel>

      <Panel title="Layout side">
        <p className="text-[11px] text-gray-500 dark:text-neutral-400">
          A 4LO request and the iskotistiks ping both go to these addresses. Left blank, the notice still records
          on the article but nobody on the Layout side is notified.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {([
            ["layoutDeputyEmail", "Layout Deputy"],
            ["layoutEditorEmail", "Layout Editor"],
            ["illustrationEditorEmail", "Illustration Editor"],
          ] as const).map(([key, label]) => (
            <Field key={key} label={label}>
              <input className={INPUT} value={state.contacts[key]} onChange={(e) => patchContact(key, e.target.value)} placeholder="address@up.edu.ph" />
            </Field>
          ))}
        </div>
      </Panel>

      <Panel title="Template links">
        {state.quickLinks.length === 0 ? <Empty text="No links configured." /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {state.quickLinks.map((link) => (
              <Field key={link.id} label={link.label}>
                <div className="flex items-center gap-1.5">
                  <Link2 className={`w-3.5 h-3.5 shrink-0 ${link.url ? "text-brand-maroon dark:text-brand-maroon-light" : "text-gray-300 dark:text-neutral-600"}`} />
                  <input className={INPUT} value={link.url} onChange={(e) => patchLink(link.id, e.target.value)} placeholder="https://docs.google.com/…" />
                </div>
              </Field>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="This build">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 dark:border-neutral-800 p-2.5">
            <dt className="text-gray-500 dark:text-neutral-400">Shared board</dt>
            <dd>{CLOUD_ENABLED ? <Pill tone="green">Supabase connected</Pill> : <Pill tone="amber">No VITE_SUPABASE_URL</Pill>}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 dark:border-neutral-800 p-2.5">
            <dt className="text-gray-500 dark:text-neutral-400">Shortform sheet sync</dt>
            <dd>{SHEETS_URL ? <Pill tone="green">Apps Script connected</Pill> : <Pill tone="amber">No VITE_SHORTFORM_APPS_SCRIPT_URL</Pill>}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 dark:border-neutral-800 p-2.5 sm:col-span-2">
            <dt className="text-gray-500 dark:text-neutral-400">Layout desk</dt>
            <dd className="font-mono text-[10px] text-gray-700 dark:text-neutral-300 truncate">{MKULAYOUT_URL}</dd>
          </div>
        </dl>
        <p className="text-[10px] text-gray-400 dark:text-neutral-500">
          {CLOUD_ENABLED
            ? "The board is shared with the section through the News Supabase project — never MKuLayout's database. Resetting discards this browser's unsent edits and reloads what everyone else sees."
            : "This build keeps its board in this browser only, so nothing here is shared with the rest of the section. Resetting clears every article, pitch and shortform row recorded on this machine."}
        </p>
        <Button
          tone="warn"
          onClick={async () => {
            if (!window.confirm(CLOUD_ENABLED
              ? "Discard this browser's unsent edits and reload the shared board?"
              : "Clear this browser's MKule News board?")) return;
            await resetDesk();
            window.location.reload();
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" /> {CLOUD_ENABLED ? "Reload shared board" : "Reset local board"}
        </Button>
      </Panel>
    </Desk>
  );
}
