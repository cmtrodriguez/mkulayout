// The News section's own Supabase client, built from the two public env values.
//
// MKuLayout keeps its data in a different project; nothing here shares a URL, a key or a
// table with it. When the variables are absent the client stays null and the desk runs on
// localStorage alone, which is what a fresh clone without credentials gets.
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "";
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) || "";

let client: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client = url && key
    ? createClient(url, key, {
        auth: { persistSession: true, detectSessionInUrl: true },
      })
    : null;
  return client;
}

/** Whether the desk has a shared backend to talk to. False means every board is local. */
export const CLOUD_ENABLED = Boolean(url && key);

export const BOARD_TABLE = "news_board";
export const ASSESSMENT_TABLE = "news_assessments";

export interface NewsProfile {
  email: string;
  name: string;
  picture?: string;
}

export async function currentProfile(): Promise<NewsProfile | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user?.email) return null;
  return {
    email: user.email,
    name: (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || user.email,
    picture: user.user_metadata?.avatar_url as string | undefined,
  };
}
