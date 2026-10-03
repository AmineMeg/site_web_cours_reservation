import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export async function verifyCurrentPassword(email: string, password: string, expectedUserId: string): Promise<boolean> {
  const verifier = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await verifier.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    console.error("[security] Password confirmation rejected", error?.code);
    return false;
  }
  const matches = data.user.id === expectedUserId;
  const { error: signOutError } = await verifier.auth.signOut({ scope: "local" });
  if (signOutError) {
    console.error("[security] Password confirmation session cleanup failed", signOutError.code);
    return false;
  }
  return matches;
}
