"use server";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { reviewText as r } from "@/lib/i18n/reviews";
import type { ActionResult } from "@/lib/types";

export async function moderateReview(_state: ActionResult | null, form: FormData): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  const id = form.get("id"), status = form.get("status"), updated = form.get("updated");
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || typeof updated !== "string" ||
    !Number.isFinite(Date.parse(updated)) || (status !== "approved" && status !== "rejected")) return { ok: false, message: r.error };
  const { error } = await supabase.rpc("moderate_student_review", { p_id: id, p_status: status, p_updated_at: updated });
  if (error) {
    console.error("[reviews] Moderation failed", error.code);
    return { ok: false, message: error.message.includes("REVIEW_CONFLICT") ? r.stale : r.error };
  }
  revalidatePath("/");
  revalidatePath("/admin/reviews");
  revalidatePath("/admin/website");
  revalidatePath("/dashboard/review");
  return { ok: true, message: r.updated };
}
