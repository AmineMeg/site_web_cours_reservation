"use server";

import { revalidatePath } from "next/cache";
import { requireStudent, getSettings } from "@/lib/auth";
import { sendBookingEmails, sendStudentMessageToTeacher } from "@/lib/notifications";
import { formatDateTime } from "@/lib/dates";
import { field } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { ActionResult } from "@/lib/types";

export async function bookLesson(startsAt: string): Promise<ActionResult> {
  const { supabase, profile } = await requireStudent();
  const b = t.dashboard.booking;
  if (Number.isNaN(Date.parse(startsAt))) return { ok: false, message: t.common.error };

  // All checks (credits, availability, overlap) + credit removal happen atomically in the DB.
  const { error } = await supabase.rpc("book_lesson", { p_starts_at: startsAt });
  if (error) {
    const code = Object.keys(b.errors).find((k) => error.message.includes(k));
    if (!code) console.error("[dashboard] book_lesson", error);
    return { ok: false, message: code ? b.errors[code] : t.common.error };
  }

  const settings = await getSettings(supabase);
  await sendBookingEmails({
    name: profile.full_name,
    email: profile.email,
    when: formatDateTime(startsAt, settings.timezone),
  });

  revalidatePath("/dashboard", "layout");
  return { ok: true, message: b.success };
}

export async function updateMyProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, profile } = await requireStudent();
  // Only these columns can be changed by students (also enforced by a DB trigger).
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: field(formData, "full_name").slice(0, 120),
      phone: field(formData, "phone").slice(0, 40),
      objectives: field(formData, "objectives").slice(0, 4000),
    })
    .eq("id", profile.id);
  if (error) return { ok: false, message: t.common.error };
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: t.dashboard.profile.saved };
}

export async function changePassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireStudent();
  const p = t.dashboard.profile;
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { ok: false, message: p.passwordTooShort };
  if (password !== confirm) return { ok: false, message: p.passwordMismatch };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: t.common.error };
  return { ok: true, message: p.passwordSaved };
}

export async function sendMessageToTeacher(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, profile } = await requireStudent();
  const body = field(formData, "message").slice(0, 4000);
  if (!body) return { ok: false, message: t.dashboard.contact.empty };

  const { error } = await supabase.from("messages").insert({ student_id: profile.id, body });
  if (error) return { ok: false, message: t.common.error };

  await sendStudentMessageToTeacher({ name: profile.full_name, email: profile.email, message: body });
  return { ok: true, message: t.dashboard.contact.sent };
}
