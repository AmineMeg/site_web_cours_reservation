"use server";
import { revalidatePath } from "next/cache";
import { requireStudent } from "@/lib/auth";
import { reviewText as r } from "@/lib/i18n/reviews";
import type { ActionResult } from "@/lib/types";

export async function submitReview(_state: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireStudent();
  const name = form.get("name");
  const quote = form.get("quote");
  if (typeof name !== "string" || typeof quote !== "string" || !name.trim() || name.trim().length > 80 ||
    quote.trim().length < 20 || quote.trim().length > 2000 || form.get("consent") !== "on") {
    return { ok: false, message: r.invalid };
  }
  const { error } = await supabase.rpc("submit_student_review", { p_name: name.trim(), p_quote: quote.trim(), p_consent: true });
  if (error) {
    console.error("[reviews] Submission failed", error.code);
    return { ok: false, message: error.message.includes("NOT_ELIGIBLE") ? r.ineligible : error.code === "23505" ? r.stale : r.error };
  }
  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin/reviews");
  return { ok: true, message: r.saved };
}

export async function withdrawReview(_state: ActionResult | null, _form: FormData): Promise<ActionResult> {
  const { supabase } = await requireStudent();
  const { error } = await supabase.rpc("withdraw_student_review");
  if (error) {
    console.error("[reviews] Withdrawal failed", error.code);
    return { ok: false, message: error.message.includes("REVIEW_CONFLICT") ? r.stale : r.error };
  }
  revalidatePath("/");
  revalidatePath("/admin/reviews");
  revalidatePath("/admin/website");
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: r.withdrawn };
}
