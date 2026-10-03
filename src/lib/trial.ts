import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Contact, TrialBooking } from "@/lib/types";

export function newTrialToken() {
  const token = randomBytes(32).toString("hex");
  return { token, hash: trialHash(token)! };
}

export function trialHash(token: string): string | null {
  return /^[a-f0-9]{64}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}

export interface TrialContext {
  contact: Contact;
  booking: TrialBooking | null;
  expires_at: string;
  slots: { startsAt: string; endsAt: string }[];
}

export async function getTrialContext(token: string) {
  const hash = trialHash(token);
  if (!hash) return { data: null, error: "LINK_EXPIRED" };
  const { data, error } = await createAdminClient().rpc("trial_context", { p_hash: hash });
  if (error) {
    if (error.message.includes("LINK_EXPIRED")) return { data: null, error: "LINK_EXPIRED" };
    console.error("[trial] Context unavailable", error.code);
    return { data: null, error: "UNAVAILABLE" };
  }
  if (!data) {
    console.error("[trial] Empty context response");
    return { data: null, error: "UNAVAILABLE" };
  }
  return { data: data as TrialContext, error: null };
}
