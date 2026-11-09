// Sign-in screen. Google is the only path in a configured build; the roster list below it
// appears solely on a local run with no OAuth client, so the desk can be exercised before
// credentials exist.
import { useRef } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Account } from "../types";
import { CLIENT_ID, GoogleProfile, isLocalDemoEnabled, useGoogleSignIn } from "../lib/auth";
import { Button, Pill } from "./ui";

export default function Login({ accounts, unknownEmail, onPick }: {
  accounts: Account[];
  unknownEmail: string;
  onPick: (email: string) => void;
}) {
  const slot = useRef<HTMLDivElement | null>(null);
  const { error, ready, renderButton } = useGoogleSignIn((profile: GoogleProfile) => onPick(profile.email));

  return (
    <div className="min-h-screen bg-[#faf9f6] dark:bg-neutral-950 grid-lines-bg flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-md rounded-2xl border border-gray-100 dark:border-neutral-800 p-6 sm:p-7 space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-maroon to-brand-maroon-dark flex items-center justify-center text-white text-sm font-black">N</span>
            <h1 className="text-lg font-black text-gray-950 dark:text-neutral-50">MKule News</h1>
            <Pill tone="maroon">Section desk</Pill>
          </div>
          <p className="text-[11px] sm:text-xs text-gray-500 dark:text-neutral-400">
            Task organizer and editing pipeline for the News section.
          </p>
        </div>

        {CLIENT_ID ? (
          <div className="space-y-3">
            <div ref={(el) => { slot.current = el; renderButton(el); }} className="flex justify-center min-h-[44px]" />
            {!ready && !error && <p className="text-[11px] text-gray-400 dark:text-neutral-500 text-center">Loading Google Sign-In…</p>}
            {error && (
              <p className="flex items-start gap-2 text-[11px] text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
            <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Google Sign-In is not configured</p>
            <p className="text-[11px] text-amber-900 dark:text-amber-200">
              Set <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code> to a Web OAuth client that lists this
              origin under Authorized JavaScript origins, then rebuild.
            </p>
          </div>
        )}

        {unknownEmail && (
          <div className="space-y-1.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 p-3">
            <p className="text-[11px] font-bold text-rose-800 dark:text-rose-300">Not on the News roster</p>
            <p className="text-[11px] text-rose-900 dark:text-rose-200">
              <span className="font-mono">{unknownEmail}</span> signed in successfully but is not a mapped News account,
              so the desk stayed closed. A lead can map that address to a member in Settings.
            </p>
          </div>
        )}

        {isLocalDemoEnabled() && (
          <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-neutral-800">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-neutral-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Local desk access
            </p>
            <div className="space-y-1.5">
              {accounts.map((a) => (
                <Button key={a.email} tone="ghost" className="w-full justify-between" onClick={() => onPick(a.email)} title={`Open the desk as ${a.name}`}>
                  <span>{a.name}</span>
                  <span className="text-[10px] font-mono opacity-70">{a.role}</span>
                </Button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 dark:text-neutral-500">
              Available only on localhost with no client ID. Deployed builds sign in through Google alone.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
