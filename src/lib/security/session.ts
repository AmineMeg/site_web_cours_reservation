import "server-only";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/** session_id claim of the current (verified) access token, or null. */
export async function currentSessionId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  const sid = data?.claims?.session_id;
  return !error && typeof sid === "string" ? sid : null;
}

/**
 * Ends the local session: revokes its refresh token when Supabase still knows
 * it, then always drops the auth cookies (even if the server call failed).
 */
export async function endLocalSession(supabase: SupabaseClient): Promise<void> {
  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) console.error("[security] Local sign-out incomplete", error.code);
  } catch (error) {
    console.error("[security] Local sign-out failed", error instanceof Error ? error.name : "unknown");
  }
  const store = await cookies();
  for (const cookie of store.getAll()) {
    if (cookie.name.startsWith("sb-")) store.delete(cookie.name);
  }
}