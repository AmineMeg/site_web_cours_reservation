import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export interface TrialSlot { startsAt: string; endsAt: string }

export const getPublicTrialSlots = cache(async (): Promise<TrialSlot[]> => {
  const { data, error } = await createAdminClient().rpc("trial_available_slots");
  if (error) {
    console.error("[trial] Public calendar unavailable", error.code);
    throw new Error("Unable to load trial availability. Run the public trial booking migration.");
  }
  if (!Array.isArray(data) || !data.every((slot): slot is TrialSlot =>
    typeof slot?.startsAt === "string" && Number.isFinite(Date.parse(slot.startsAt)) &&
    typeof slot?.endsAt === "string" && Date.parse(slot.endsAt) - Date.parse(slot.startsAt) === 1800_000
  )) {
    console.error("[trial] Invalid public availability");
    throw new Error("Invalid trial availability");
  }
  return data;
});
