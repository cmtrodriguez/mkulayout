// Who is at the desk, and how they got there.
//
// With a Supabase project configured, Google sign-in runs through Supabase Auth: the
// provider hands the code back to this origin, Supabase returns the session, and every
// read and write this tab makes afterwards carries its access token — which is what the
// row-level security policies in schema.sql judge. The old client-side Google Identity
// path is gone because a token decoded in the browser proves nothing to a database.
//
// With no project configured the desk stays where it started: one localStorage board and,
// on localhost only, a roster list to sign in as.
import { useCallback, useEffect, useState } from "react";
import { NewsState, accountByEmail } from "./store";
import { CLOUD_ENABLED, supabase } from "./supabase";

export const SESSION_KEY = "mkule-news:session";

export interface DeskSession {
  email: string;
  name: string;
  picture?: string;
  /** Supabase is still answering the initial session check. */
  loading: boolean;
  error: string;
  /** Starts the Google redirect (cloud) — there is nothing to pick in between. */
  signIn: () => void;
  signOut: () => Promise<void>;
  /** Local demo only: adopt a seeded roster member. */
  pickLocal: (email: string) => void;
}

/** A local run with no backend still needs to be exercised, so the desk offers the seeded
    roster as a sign-in list. A configured or deployed build never gets this path. */
export function isLocalDemoEnabled(): boolean {
  if (CLOUD_ENABLED) return false;
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

export function readSession(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(SESSION_KEY) || "";
}

function saveLocal(email: string) {
  localStorage.setItem(SESSION_KEY, email);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function useDeskSession(): DeskSession {
  const [email, setEmail] = useState(CLOUD_ENABLED ? "" : readSession());
  const [name, setName] = useState("");
  const [picture, setPicture] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(CLOUD_ENABLED);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!CLOUD_ENABLED) return;
    const sb = supabase();
    if (!sb) return;
    let alive = true;

    const apply = (session: { user: { email?: string; user_metadata?: Record<string, unknown> } | null }) => {
      if (!alive) return;
      const u = session?.user;
      setEmail(u?.email || "");
      setName((u?.user_metadata?.full_name as string) || (u?.user_metadata?.name as string) || u?.email || "");
      setPicture((u?.user_metadata?.avatar_url as string) || undefined);
      setLoading(false);
    };

    sb.auth.getSession().then(({ data }) => apply(data.session)).catch(() => setLoading(false));
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => apply(session as never));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const signIn = useCallback(() => {
    const sb = supabase();
    if (!sb) { setError("No Supabase project is configured for this build."); return; }
    sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    }).then(({ error: err }) => {
      if (err) setError(err.message);
    });
  }, []);

  const signOut = useCallback(async () => {
    const sb = supabase();
    if (sb) await sb.auth.signOut();
    clearSession();
    setEmail("");
    setName("");
  }, []);

  const pickLocal = useCallback((next: string) => {
    saveLocal(next);
    setEmail(next);
  }, []);

  return { email, name, picture, loading, error, signIn, signOut, pickLocal };
}

export function accountForEmail(state: NewsState, email: string) {
  return accountByEmail(state, email);
}
