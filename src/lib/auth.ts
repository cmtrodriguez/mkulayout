// Google Sign-In via Google Identity Services, plus the session record it leaves behind.
//
// The credential is read client-side (GIS hands back an ID token; we decode the payload
// for name/email/picture). That is enough to decide which desk a member sees, and nothing
// in this app is trusted beyond that: the state it writes stays in the browser until the
// desk gets a backend, at which point the same token should be verified server-side
// against the Google certificates instead of decoded here.

import { useCallback, useEffect, useState } from "react";
import { SEED_ACCOUNTS } from "../types";
import { NewsState, accountByEmail } from "./store";

export const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || "";
export const SESSION_KEY = "mkule-news:session";

const GSI_SRC = "https://accounts.google.com/gsi/client";

export interface GoogleProfile {
  email: string;
  name: string;
  picture?: string;
}

interface GisId {
  initialize: (options: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }) => void;
  renderButton: (el: HTMLElement, options: Record<string, string | number | boolean>) => void;
}

declare global {
  interface Window { google?: { accounts?: { id?: GisId } } }
}

/** A local run with no OAuth client configured still needs to be exercised, so the desk
    offers the seeded roster as a sign-in list. Deployed origins never get this path. */
export function isLocalDemoEnabled(): boolean {
  if (CLIENT_ID) return false;
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const script = existing || document.createElement("script");
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Google Sign-In script did not load.")));
    if (!existing) {
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

/** GIS answers with an ID token whose middle segment is the base64url profile payload. */
export function decodeCredential(credential: string): GoogleProfile | null {
  const payload = credential.split(".")[1];
  if (!payload) return null;
  try {
    const json = decodeURIComponent(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join("")
    );
    const claims = JSON.parse(json) as { email?: string; name?: string; picture?: string };
    if (!claims.email) return null;
    return { email: claims.email, name: claims.name || claims.email, picture: claims.picture };
  } catch {
    return null;
  }
}

export function useGoogleSignIn(onSignedIn: (profile: GoogleProfile) => void) {
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let alive = true;
    loadGsiScript()
      .then(() => {
        if (!alive) return;
        const id = window.google?.accounts?.id;
        if (!id) { setError("Google Sign-In is unavailable in this browser."); return; }
        id.initialize({
          client_id: CLIENT_ID,
          callback: (res) => {
            const profile = decodeCredential(res.credential);
            if (!profile) { setError("Google returned a credential this desk could not read."); return; }
            onSignedIn(profile);
          },
        });
        setReady(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Google Sign-In failed to load."));
    return () => { alive = false; };
    // The callback is fixed at mount; re-initialising GIS on every render would drop the
    // prompt mid-flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderButton = useCallback((el: HTMLElement | null) => {
    if (!el || !ready) return;
    const id = window.google?.accounts?.id;
    if (!id) return;
    el.replaceChildren();
    id.renderButton(el, { theme: "filled_black", size: "large", width: 320, text: "signin_with", shape: "pill" });
  }, [ready]);

  return { error, ready, renderButton };
}

export function readSession(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(SESSION_KEY) || "";
}

export function saveSession(email: string) {
  localStorage.setItem(SESSION_KEY, email);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function accountForEmail(state: NewsState, email: string) {
  return accountByEmail(state, email);
}

/** The roster emails the app ships with, shown on the blocked screen so a lead knows
    which address still needs mapping. */
export function seededRoster() {
  return SEED_ACCOUNTS.map((a) => ({ name: a.name, role: a.role, email: a.email, confirmed: a.emailConfirmed }));
}
