"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher, getSettings } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCancellationNotice, sendNewPassword, sendStudentCredentials } from "@/lib/notifications";
import { EMAIL_REGEX, field, generatePassword } from "@/lib/utils";
import { formatDateTime, timeToMinutes, weekdayNames } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { ActionResult, Contact, Profile, WeeklyAvailability } from "@/lib/types";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;

function fail(message: string = t.common.error): ActionResult {
  return { ok: false, message };
}

// ---------------------------------------------------------------------------
// Tab 1 – New contacts
// ---------------------------------------------------------------------------

/** 1-click: contact -> student account (0 credits) + credentials email. */
export async function createStudentFromContact(contactId: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();

  const { data } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  const contact = data as Contact | null;
  if (!contact || contact.converted_at) return fail();

  const admin = createAdminClient();
  const password = generatePassword();

  const { data: created, error } = await admin.auth.admin.createUser({
    email: contact.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: contact.name, phone: contact.phone },
  });

  if (error || !created.user) {
    const exists = error?.code === "email_exists" || /already/i.test(error?.message ?? "");
    console.error("[admin] createUser failed", error);
    return fail(exists ? t.admin.contacts.emailExists : t.common.error);
  }

  // The DB trigger creates the profile; upsert makes sure all fields are set.
  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id,
    role: "student",
    email: contact.email,
    full_name: contact.name,
    phone: contact.phone,
    objectives: contact.message,
    credits: 0,
    is_active: true,
  });
  if (profileError) {
    console.error("[admin] profile upsert failed", profileError);
    await admin.auth.admin.deleteUser(created.user.id);
    return fail();
  }

  await supabase
    .from("contacts")
    .update({ converted_at: new Date().toISOString(), student_id: created.user.id })
    .eq("id", contact.id);

  await sendStudentCredentials({ name: contact.name, email: contact.email, password });

  revalidatePath("/admin", "layout");
  return { ok: true, message: t.admin.contacts.created(contact.name) };
}

export async function deleteContact(contactId: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  const { error } = await supabase.from("contacts").delete().eq("id", contactId);
  if (error) return fail();
  revalidatePath("/admin", "layout");
  return { ok: true, message: t.admin.contacts.removed };
}

// ---------------------------------------------------------------------------
// Tab 2 – Students
// ---------------------------------------------------------------------------

export async function adjustCredits(
  studentId: string,
  delta: number,
): Promise<ActionResult & { credits?: number }> {
  const { supabase } = await requireTeacher();
  const amount = Math.trunc(delta);
  if (!amount || Math.abs(amount) > 100) return fail();

  const { data, error } = await supabase.rpc("adjust_credits", { p_student_id: studentId, p_delta: amount });
  if (error) {
    console.error("[admin] adjust_credits", error);
    return fail();
  }
  revalidatePath("/admin/students", "layout");
  const credits = Number(data);
  return { ok: true, message: t.admin.credits.updated(credits), credits };
}

export async function updateStudent(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  const id = field(formData, "id");
  const update = {
    full_name: field(formData, "full_name").slice(0, 120),
    email: field(formData, "email").toLowerCase(),
    phone: field(formData, "phone").slice(0, 40),
    objectives: field(formData, "objectives").slice(0, 4000),
    teacher_notes: field(formData, "teacher_notes").slice(0, 4000),
    is_active: formData.get("is_active") === "on",
  };
  if (!id || !EMAIL_REGEX.test(update.email)) return fail(t.landing.contact.errors.email);

  const { data: current } = await supabase.from("profiles").select("email, role").eq("id", id).maybeSingle();
  if (!current || (current as Profile).role !== "student") return fail(t.admin.studentDetail.notFound);

  // Changing the login email must also be done in Supabase Auth.
  if ((current as Profile).email !== update.email) {
    const { error } = await createAdminClient().auth.admin.updateUserById(id, {
      email: update.email,
      email_confirm: true,
    });
    if (error) {
      const exists = /already/i.test(error.message);
      return fail(exists ? t.admin.contacts.emailExists : t.common.error);
    }
  }

  const { error } = await supabase.from("profiles").update(update).eq("id", id);
  if (error) return fail();

  revalidatePath("/admin/students", "layout");
  return { ok: true, message: t.admin.studentDetail.saved };
}

export async function resetStudentPassword(studentId: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  const { data } = await supabase.from("profiles").select("*").eq("id", studentId).maybeSingle();
  const student = data as Profile | null;
  if (!student || student.role !== "student") return fail(t.admin.studentDetail.notFound);

  const password = generatePassword();
  const { error } = await createAdminClient().auth.admin.updateUserById(studentId, { password });
  if (error) return fail();

  await sendNewPassword({ name: student.full_name, email: student.email, password });
  return { ok: true, message: t.admin.studentDetail.resetPasswordDone };
}

// ---------------------------------------------------------------------------
// Tab 3 – Schedule
// ---------------------------------------------------------------------------

/** Cancels a lesson, refunds 1 credit (in the DB function) and emails the student. */
export async function cancelLesson(bookingId: string, message: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  const text = message.trim();
  if (!text) return fail(t.admin.lessonModal.messageRequired);

  const { data, error } = await supabase.rpc("cancel_lesson", { p_booking_id: bookingId, p_message: text });
  if (error || !data) {
    console.error("[admin] cancel_lesson", error);
    return fail();
  }

  const booking = data as { student_id: string; starts_at: string };
  const [{ data: student }, settings] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", booking.student_id).maybeSingle(),
    getSettings(supabase),
  ]);

  if (student) {
    await sendCancellationNotice({
      name: student.full_name,
      email: student.email,
      when: formatDateTime(booking.starts_at, settings.timezone),
      message: text,
    });
  }

  revalidatePath("/admin", "layout");
  return { ok: true, message: t.admin.lessonModal.cancelled };
}

export async function saveWeeklyHours(rows: WeeklyAvailability[]): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  const names = weekdayNames();

  if (!Array.isArray(rows) || rows.length !== 7) return fail();
  const seen = new Set<number>();
  for (const r of rows) {
    if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6 || seen.has(r.weekday)) return fail();
    seen.add(r.weekday);
    if (!TIME.test(r.start_time) || !TIME.test(r.end_time)) return fail();
    if (timeToMinutes(r.end_time) <= timeToMinutes(r.start_time)) {
      return fail(t.admin.schedule.hours.invalid(names[r.weekday]));
    }
  }

  const { error } = await supabase.from("weekly_availability").upsert(
    rows.map((r) => ({
      weekday: r.weekday,
      is_active: !!r.is_active,
      start_time: r.start_time,
      end_time: r.end_time,
    })),
  );
  if (error) return fail();

  revalidatePath("/admin/schedule");
  return { ok: true, message: t.admin.schedule.hours.saved };
}

/** Blocks a whole day (replaces any partial blocks of that day). */
export async function blockWholeDay(day: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  if (!DAY_KEY.test(day)) return fail();
  await supabase.from("blocked_slots").delete().eq("day", day);
  const { error } = await supabase.from("blocked_slots").insert({ day });
  if (error) return fail();
  revalidatePath("/admin/schedule");
  return { ok: true, message: "" };
}

export async function blockHours(day: string, start: string, end: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  if (!DAY_KEY.test(day) || !TIME.test(start) || !TIME.test(end)) return fail();
  if (timeToMinutes(end) <= timeToMinutes(start)) return fail();
  const { error } = await supabase.from("blocked_slots").insert({ day, start_time: start, end_time: end });
  if (error) return fail();
  revalidatePath("/admin/schedule");
  return { ok: true, message: "" };
}

export async function unblock(blockId: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  const { error } = await supabase.from("blocked_slots").delete().eq("id", blockId);
  if (error) return fail();
  revalidatePath("/admin/schedule");
  return { ok: true, message: "" };
}

export async function unblockDay(day: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  if (!DAY_KEY.test(day)) return fail();
  const { error } = await supabase.from("blocked_slots").delete().eq("day", day);
  if (error) return fail();
  revalidatePath("/admin/schedule");
  return { ok: true, message: "" };
}
