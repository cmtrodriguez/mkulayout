// Shared desk primitives. The class strings are lifted from MKuLayout's own cards so the
// two tools read as one product: same maroon, same glass panels, same tiny uppercase labels.
import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";

export const LABEL = "text-[9px] sm:text-[10px] text-gray-400 dark:text-neutral-400 uppercase font-semibold block";
export const INPUT = "w-full px-3 py-2 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs bg-white dark:bg-neutral-800 text-gray-800 dark:text-neutral-100 outline-none focus:ring-2 focus:ring-brand-maroon";
export const CARD = "glass-card rounded-xl sm:rounded-2xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900";

export function Desk({ title, note, actions, children }: { title: string; note?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-black text-gray-950 dark:text-neutral-50">{title}</h2>
          {note && <p className="text-[11px] sm:text-xs text-gray-500 dark:text-neutral-400">{note}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Panel({ title, right, children, className = "" }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`${CARD} p-3.5 sm:p-5 space-y-3 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-neutral-100">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES: Record<string, string> = {
  maroon: "bg-brand-maroon/5 dark:bg-brand-maroon/20 text-brand-maroon dark:text-brand-maroon-light border-brand-maroon/10 dark:border-brand-maroon/30",
  gray: "bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 border-gray-200 dark:border-neutral-700",
  blue: "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  amber: "bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  red: "bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  green: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  cyan: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
  purple: "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
};

export function Pill({ tone = "gray", children, className = "" }: { tone?: keyof typeof TONES | string; children: ReactNode; className?: string }) {
  return (
    <span className={`text-[9px] sm:text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${TONES[tone] || TONES.gray} ${className}`}>
      {children}
    </span>
  );
}

const BUTTONS = {
  primary: "bg-brand-maroon hover:bg-brand-maroon-dark text-white border-transparent",
  pass: "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent",
  warn: "bg-white dark:bg-neutral-800 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40",
  ghost: "bg-white dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 border-gray-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700",
};

export function Button({ tone = "primary", className = "", children, ...rest }: { tone?: keyof typeof BUTTONS; className?: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`px-2.5 sm:px-3 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold border flex items-center gap-1 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${BUTTONS[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={LABEL}>{label}</span>
      {children}
      {hint && <span className="text-[10px] text-gray-400 dark:text-neutral-500 block">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-xl"} ${CARD} p-4 sm:p-5 space-y-4 my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm sm:text-base font-black text-gray-950 dark:text-neutral-50">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-gray-500 dark:text-neutral-400 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <p className="text-[11px] sm:text-xs text-gray-400 dark:text-neutral-500 italic px-1 py-3 border border-dashed border-gray-200 dark:border-neutral-700 rounded-xl text-center">
      {text}
    </p>
  );
}

export function Stars({ value, onChange, label }: { value: number; onChange?: (n: number) => void; label?: string }) {
  return (
    <div className="flex items-center gap-1" role={onChange ? "radiogroup" : undefined} aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          aria-label={`${n} of 5`}
          className={`w-6 h-6 sm:w-7 sm:h-7 rounded-md border text-[11px] font-black flex items-center justify-center transition-all ${
            onChange ? "cursor-pointer" : "cursor-default"
          } ${
            n <= value
              ? "bg-brand-maroon text-white border-brand-maroon-dark"
              : "bg-white dark:bg-neutral-800 text-gray-300 dark:text-neutral-600 border-gray-200 dark:border-neutral-700"
          }`}
        >
          {n}
        </button>
      ))}
      <span className="text-[10px] text-gray-400 dark:text-neutral-500 ml-1">{value ? `${value}/5` : "Not rated"}</span>
    </div>
  );
}

export function two(value: number): string {
  return `${value}`.padStart(2, "0");
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The layout desk writes release dates like "NOVEMBER 12"; accept that or an ISO date. */
export function parseReleaseDate(raw?: string): Date | null {
  if (!raw) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? new Date(`${raw.trim()}T00:00:00`) : new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

export function isPastDue(raw?: string): boolean {
  const d = parseReleaseDate(raw);
  if (!d) return false;
  return d.getTime() < Date.now();
}

export function releaseDateLabel(raw?: string): string {
  const d = parseReleaseDate(raw);
  if (!d) return raw || "";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export function monthPeriod(d = new Date()): string {
  return `${d.toLocaleDateString(undefined, { month: "long" })} ${d.getFullYear()}`;
}
