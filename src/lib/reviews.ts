import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export type PublicReview = { id: string; display_name: string; quote: string };
export type StudentReview = PublicReview & {
  student_id: string; status: "pending" | "approved" | "rejected" | "withdrawn";
  updated_at: string; created_at: string;
};

export const getPublicReviews = cache(async (): Promise<PublicReview[]> => {
  const supabase = createClient(supabaseUrl(), supabaseAnonKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.rpc("get_public_reviews");
  if (error) {
    console.error("[reviews] Public reviews load failed", error.code);
    throw new Error("Unable to load reviews. Run student-reviews.sql.");
  }
  return data ?? [];
});

export async function getReviewState(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("get_my_review_state");
  if (error || !data?.[0]) {
    console.error("[reviews] Student invitation load failed", error?.code);
    throw new Error("Unable to load review invitation. Run student-reviews.sql.");
  }
  return data[0] as { eligible: boolean; has_review: boolean };
}
