// Roster desk: who is in News, when they can take work, and what they have carried.
//
// Counts follow the section's own accounting — longform is a published news article or
// news feat, shortform is a published Facebook piece, and "in the pipeline" is anything
// still moving. A member reads their own numbers; the leads read everyone's.
import { useState } from "react";
import { CalendarCheck, Clock, Users } from "lucide-react";
import { Account, DAYS, NewsRole, ROLE_ORDER, TIME_SLOTS } from "../types";
import { NewsState, availabilityFor, mutate, setAvailability } from "../lib/store";
import { isEditorial, workloadByMember } from "../lib/workflow";
import { Button, Desk, Empty, Modal, Panel, Pill } from "./ui";

function activeDays(avail: { days: Record<string, string[]>; unavailableDays: string[] }): number {
  return DAYS.filter((d) => (avail.days[d] || []).length > 0).length;
}

function totalSlots(days: Record<string, string[]>): number {
  return DAYS.reduce((sum, d) => sum + (days[d] || []).length, 0);
}

function AvailabilityModal({ account, viewer, state, onClose }: {
  account: Account;
  viewer: Account;
  state: NewsState;
  onClose: () => void;
}) {
  const editable = account.email.toLowerCase() === viewer.email.toLowerCase();
  const source = availabilityFor(state, account.email);
  const [days, setDays] = useState<Record<string, string[]>>(() => {
    const copy: Record<string, string[]> = {};
    DAYS.forEach((d) => { copy[d] = [...(source.days[d] || [])]; });
    return copy;
  });
  const [off, setOff] = useState<string[]>([...(source.unavailableDays || [])]);

  const toggleSlot = (day: string, slot: string) => {
    setDays((prev) => {
      const current = prev[day] || [];
      const next = current.includes(slot)
        ? current.filter((s) => s !== slot)
        : [...current, slot].sort((a, b) => TIME_SLOTS.indexOf(a) - TIME_SLOTS.indexOf(b));
      return { ...prev, [day]: next };
    });
  };

  const toggleDayOff = (day: string) => {
    setOff((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
      if (next.includes(day)) setDays((p) => ({ ...p, [day]: [] }));
      return next;
    });
  };

  return (
    <Modal title={`${account.name} — weekly availability`} onClose={onClose} wide>
      {!editable && (
        <p className="text-[11px] text-gray-500 dark:text-neutral-400">
          Only {account.name} can change this grid. It is shown here so the desk knows when to route work.
        </p>
      )}
      <div className="space-y-2.5">
        {DAYS.map((day) => (
          <div key={day} className="rounded-xl border border-gray-100 dark:border-neutral-800 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs font-bold text-gray-900 dark:text-neutral-100">{day}</span>
              {editable && (
                <Button tone={off.includes(day) ? "warn" : "ghost"} onClick={() => toggleDayOff(day)}>
                  {off.includes(day) ? "Marked unavailable" : "Mark unavailable"}
                </Button>
              )}
            </div>
            {off.includes(day) ? (
              <p className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold uppercase">Not available this day</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {TIME_SLOTS.map((slot) => {
                  const on = (days[day] || []).includes(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={!editable}
                      onClick={() => toggleSlot(day, slot)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                        editable ? "cursor-pointer" : "cursor-default"
                      } ${
                        on
                          ? "bg-brand-maroon text-white border-brand-maroon-dark"
                          : "bg-white dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 border-gray-200 dark:border-neutral-700"
                      }`}
                    >
                      {slot}
                    </button>
                  );
                })}
                {(days[day] || []).length === 0 && editable && (
                  <span className="self-center text-[10px] text-gray-400 dark:text-neutral-500 italic">No hours picked yet</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-neutral-800">
          <p className="text-[10px] text-gray-400 dark:text-neutral-500">
            {activeDays({ days, unavailableDays: off })} active days · {totalSlots(days)} hourly slots
            {source.lastUpdated ? ` · last saved ${new Date(source.lastUpdated).toLocaleString()}` : ""}
          </p>
          <Button onClick={() => { mutate((draft) => setAvailability(draft, { email: account.email, days, unavailableDays: off })); onClose(); }}>
            Save availability
          </Button>
        </div>
      )}
    </Modal>
  );
}

export default function PeopleDesk({ viewer, state }: { viewer: Account; state: NewsState }) {
  const leads = isEditorial(viewer.role);
  const rows = workloadByMember(state)
    .slice()
    .sort((a, b) => (ROLE_ORDER[a.account.role as NewsRole] ?? 9) - (ROLE_ORDER[b.account.role as NewsRole] ?? 9));
  const [preview, setPreview] = useState<Account | null>(null);

  return (
    <Desk
      title="Section team"
      note="Layout member directory, weekly availability and the workload each member carries."
      actions={<Pill tone="gray"><Users className="w-3 h-3 inline mr-1" />{rows.length} members</Pill>}
    >
      {rows.length === 0 ? (
        <Panel><Empty text="No members on the roster yet." /></Panel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map(({ account, longform, shortform, inPipeline, returns }) => {
            const avail = availabilityFor(state, account.email);
            const mine = account.email.toLowerCase() === viewer.email.toLowerCase();
            const showNumbers = leads || mine;
            return (
              <div key={account.email} className="glass-card rounded-xl sm:rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3.5 sm:p-5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-maroon to-brand-maroon-dark border border-red-500/20 flex items-center justify-center text-xs font-bold text-white uppercase shrink-0">
                    {account.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-bold text-gray-950 dark:text-neutral-100 truncate">
                      {account.name}
                      {mine && <span className="ml-1.5 text-[10px] font-semibold text-gray-400 dark:text-neutral-500 normal-case">you</span>}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-neutral-400 truncate font-mono">{account.email}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Pill tone="maroon">{account.role}</Pill>
                    {!account.active && <Pill tone="red">Inactive</Pill>}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-gray-100 dark:border-neutral-800">
                  {[
                    { label: "Longform", value: longform },
                    { label: "Shortform", value: shortform },
                    { label: "In pipeline", value: inPipeline },
                    { label: "Returns", value: returns },
                  ].map((cell) => (
                    <div key={cell.label}>
                      <span className="text-[9px] sm:text-[10px] text-gray-400 dark:text-neutral-400 uppercase font-semibold block">{cell.label}</span>
                      <span className="text-xs sm:text-sm font-black text-gray-900 dark:text-neutral-100">
                        {showNumbers ? cell.value : "—"}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2 text-[10px] sm:text-[11px] text-gray-500 dark:text-neutral-400">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <CalendarCheck className="w-3.5 h-3.5 text-brand-maroon dark:text-brand-maroon-light shrink-0" />
                    {activeDays(avail) === 0
                      ? "No availability saved"
                      : `${activeDays(avail)} days · ${totalSlots(avail.days)} slots`}
                    {avail.unavailableDays.length > 0 && ` · off ${avail.unavailableDays.join(", ")}`}
                  </span>
                  <Button tone={mine ? "primary" : "ghost"} onClick={() => setPreview(account)}>
                    <Clock className="w-3 h-3" /> {mine ? "My hours" : "View"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!leads && (
        <p className="text-[10px] text-gray-400 dark:text-neutral-500">
          Counts are visible to you on your own card and to the section leads on every card.
        </p>
      )}

      {preview && <AvailabilityModal account={preview} viewer={viewer} state={state} onClose={() => setPreview(null)} />}
    </Desk>
  );
}
