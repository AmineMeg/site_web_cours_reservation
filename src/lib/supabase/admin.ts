import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client: BYPASSES Row Level Security.
 * Only use on the server, after checking the caller is allowed (e.g. requireTeacher()).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
