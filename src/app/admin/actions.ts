"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher, requireRecentAuthentication, getSettings } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingEmails, sendCancellationNotice, sendPasswordReset, sendStudentInvitation, sendTrialInvitation, sendTrialBookingEmails } from "@/lib/notifications";
import { emailIsConfigured } from "@/lib/email";
import { accountSiteUrl, confirmationLink, createAccountLink } from "@/lib/auth-links";
import { accountText } from "@/lib/i18n/account";
import { EMAIL_REGEX, field } from "@/lib/utils";
import { verifyCurrentPassword } from "@/lib/verify-password";
import { formatDateTime, timeToMinutes, weekdayNames } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { ActionResult, Contact, Profile, WeeklyAvailability } from "@/lib/types";
import { validTeacherBooking, type TeacherBookingInput } from "@/lib/teacher-booking";
import { teacherBookingText as tb } from "@/lib/i18n/teacher-booking";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { validLocation } from "@/lib/timezones";
import { newTrialToken } from "@/lib/trial";
import type { TrialBooking } from "@/lib/types";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;

function fail(message: string = t.common.error): ActionResult {
  return { ok: false, message };
}

// ---------------------------------------------------------------------------
// Tab 1 – New contacts
// ---------------------------------------------------------------------------

/** 1-click: contact -> student account (0 credits) + one-use invitation. */
export async function createStudentFromContact(contactId: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  await requireRecentAuthentication();
  if (!emailIsConfigured()) return fail(accountText.emailUnavailable);

  const { data } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
  const contact = data as Contact | null;
  if (!contact || contact.converted_at) return fail();
  const { data: allowed, error: gateError } = await supabase.rpc("can_convert_contact", { p_id: contactId });
  if (gateError) {
    console.error("[admin] Trial approval check failed", gateError.code);
    return fail();
  }
  if (allowed !== true) return fail(r.trialNotStarted);

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: contact.email,
    options: {
      redirectTo: new URL("/auth/confirm", accountSiteUrl()).toString(),
      data: { full_name: contact.name, phone: contact.phone },
    },
  });

  if (error || !created.user || !created.properties) {
    const exists = error?.code === "email_exists" || /already/i.test(error?.message ?? "");
    console.error("[admin] generate invitation failed", error?.status, error?.code);
    return fail(exists ? t.admin.contacts.emailExists : t.common.error);
  }

  // Do not overwrite credits, activation status or role on a retried invitation.
  const { data: updatedProfile, error: profileError } = await admin.from("profiles").update({
    full_name: contact.name,
    phone: contact.phone,
    objectives: contact.message,
    country: contact.country, city: contact.city, timezone: contact.timezone,
  }).eq("id", created.user.id).eq("role", "student").select("id").single();
  if (profileError || !updatedProfile) {
    console.error("[admin] profile upsert failed", profileError);
    return fail();
  }

  const { data: converted, error: conversionError } = await supabase
    .from("contacts")
    .update({ converted_at: new Date().toISOString(), student_id: created.user.id })
    .eq("id", contact.id)
    .is("converted_at", null)
    .select("id")
    .single();
  if (conversionError || !converted) {
    console.error("[admin] contact conversion failed", conversionError?.code);
    return fail();
  }

  const delivery = await sendStudentInvitation({
    name: contact.name,
    email: contact.email,
    url: confirmationLink(created.properties.hashed_token, "invite"),
  });

  revalidatePath("/admin", "layout");
  if (!delivery.ok) return fail(accountText.emailFailed);
  return { ok: true, message: t.admin.contacts.created(contact.name) };
}

export async function deleteContact(contactId: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  const { error } = await supabase.from("contacts").delete().eq("id", contactId);
  if (error) {
    console.error("[admin] Contact removal failed", error.code);
    return fail(r.contactHistory);
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: t.admin.contacts.removed };
}

export async function resendTrialLink(contactId: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  if (!emailIsConfigured()) return fail(accountText.emailUnavailable);
  const { data: contact, error: lookupError } = await supabase.from("contacts").select("name,email").eq("id", contactId).single();
  if (lookupError || !contact) {
    console.error("[admin] Trial contact lookup failed", lookupError?.code);
    return fail();
  }
  const { token, hash } = newTrialToken();
  const { error } = await supabase.rpc("renew_trial_link", { p_id: contactId, p_hash: hash });
  if (error) {
    console.error("[admin] Trial link renewal failed", error.code);
    return fail();
  }
  const delivery = await sendTrialInvitation({ ...contact, token });
  return { ok: delivery.ok, message: delivery.ok ? r.linkSent : r.savedWithoutEmail };
}

export async function declineContact(contactId: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  const { data: allowed, error: gateError } = await supabase.rpc("can_convert_contact", { p_id: contactId });
  if (gateError || allowed !== true) {
    if (gateError) console.error("[admin] Trial decision check failed", gateError.code);
    return fail(r.trialNotStarted);
  }
  const { error } = await supabase.from("contacts").update({ trial_declined_at: new Date().toISOString() })
    .eq("id", contactId).is("converted_at", null);
  if (error) {
    console.error("[admin] Trial decision failed", error.code);
    return fail();
  }
  revalidatePath("/admin/contacts");
  return { ok: true, message: r.declined };
}

export async function cancelTrialByTeacher(id: string, message: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  if (!message.trim()) return fail(t.admin.lessonModal.messageRequired);
  const { data, error } = await supabase.rpc("teacher_cancel_trial", { p_id: id, p_message: message.trim() });
  if (error || !data) {
    console.error("[admin] Trial cancellation failed", error?.code);
    return fail();
  }
  const booking = data as TrialBooking;
  const [{ data: contact, error: lookupError }, settings] = await Promise.all([
    supabase.from("contacts").select("name,email,timezone").eq("id", booking.contact_id).single(),
    getSettings(supabase),
  ]);
  if (lookupError || !contact) {
    console.error("[admin] Cancelled trial contact unavailable", lookupError?.code);
    revalidatePath("/admin", "layout");
    return { ok: true, message: r.cancelledWithoutEmail };
  }
  const delivery = await sendTrialBookingEmails({
    name: contact.name, email: contact.email, when: formatDateTime(booking.starts_at, contact.timezone),
    teacherWhen: formatDateTime(booking.starts_at, settings.timezone), cancelled: true, message: message.trim(),
  });
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: delivery.ok ? r.cancelled : r.cancelledWithoutEmail };
}

export async function saveCreditValidity(months: number): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  if (!Number.isInteger(months) || months < 1 || months > 120) return fail();
  const { error } = await supabase.from("app_settings").update({ credit_validity_months: months }).eq("id", 1);
  if (error) {
    console.error("[admin] Credit validity update failed", error.code);
    return fail();
  }
  revalidatePath("/", "layout");
  return { ok: true, message: r.settingsSaved };
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
  await requireRecentAuthentication();
  const id = field(formData, "id");
  const update = {
    full_name: field(formData, "full_name").slice(0, 120),
    email: field(formData, "email").toLowerCase(),
    phone: field(formData, "phone").slice(0, 40),
    objectives: field(formData, "objectives").slice(0, 4000),
    teacher_notes: field(formData, "teacher_notes").slice(0, 4000),
    is_active: formData.get("is_active") === "on",
    country: field(formData, "country"), timezone: field(formData, "timezone"),
  };
  if (!id || !EMAIL_REGEX.test(update.email)) return fail(t.landing.contact.errors.email);
  if (!validLocation(update)) return fail(r.locationError);

  const { data: current } = await supabase.from("profiles").select("email, role, is_active").eq("id", id).maybeSingle();
  if (!current || current.role !== "student") return fail(t.admin.studentDetail.notFound);

  if (current.email !== update.email || current.is_active !== update.is_active) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return fail();
    const { limitSensitivePasswordCheck } = await import("@/lib/security/rate-limit");
    if (!await limitSensitivePasswordCheck(user.id)) return fail();
    if (!await verifyCurrentPassword(user.email, String(formData.get("current_password") ?? ""), user.id)) {
      return fail(accountText.wrongCurrentPassword);
    }
    const { error: revokeError } = await createAdminClient().rpc("revoke_user_sessions", { p_user_id: id });
    if (revokeError) {
      console.error("[admin] Student session revocation failed", revokeError.code);
      return fail();
    }
  }

  // Changing the login email must also be done in Supabase Auth.
  if (current.email !== update.email) {
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
  await requireRecentAuthentication();
  if (!emailIsConfigured()) return fail(accountText.emailUnavailable);
  const { data } = await supabase.from("profiles").select("*").eq("id", studentId).maybeSingle();
  const student = data as Profile | null;
  if (!student || student.role !== "student") return fail(t.admin.studentDetail.notFound);

  const { data: authUser, error } = await createAdminClient().auth.admin.getUserById(studentId);
  if (error || !authUser.user?.email) {
    console.error("[admin] account lookup failed", error?.code);
    return fail();
  }
  const type = authUser.user.email_confirmed_at ? "recovery" : "invite";
  const link = await createAccountLink(authUser.user.email, type);
  if (!link) return fail(accountText.resetFailed);
  const payload = { name: student.full_name, email: authUser.user.email, url: link.url };
  const delivery = await (type === "invite" ? sendStudentInvitation(payload) : sendPasswordReset(payload));
  if (!delivery.ok) return fail(accountText.resetFailed);
  return { ok: true, message: t.admin.studentDetail.resetPasswordDone };
}

// ---------------------------------------------------------------------------
// Tab 3 – Schedule
// ---------------------------------------------------------------------------

export async function addTeacherLesson(input: TeacherBookingInput): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  if (!validTeacherBooking(input)) return fail(tb.invalid);
  const { data: student, error: studentError } = await supabase.from("profiles")
    .select("full_name,email,timezone").eq("id", input.studentId).eq("role", "student").eq("is_active", true).maybeSingle();
  if (studentError) {
    console.error("[admin] Teacher booking student lookup failed", studentError.code);
    return fail(tb.error);
  }
  if (!student) return fail(tb.inactive);
  const { data, error } = await supabase.rpc("teacher_book_lesson", {
    p_student_id: input.studentId, p_day: input.day, p_time: input.time,
    p_use_credit: input.useCredit, p_exceptional: input.exceptional, p_request_id: input.requestId,
  }).single<{ booking_id: string; starts_at: string; credits_used: number; created: boolean }>();
  if (error || !data) {
    const errors: Record<string, string> = {
      NO_CREDITS: tb.noCredits, SLOT_NOT_AVAILABLE: tb.unavailable, INVALID_BOOKING: tb.invalid,
      STUDENT_NOT_ACTIVE: tb.inactive, REQUEST_CONFLICT: tb.conflict,
      NO_VALID_CREDITS: r.noValidCredits,
    };
    const code = Object.keys(errors).find((key) => error?.message.includes(key));
    if (!code) console.error("[admin] Teacher booking failed", error?.code);
    return fail(code ? errors[code] : tb.error);
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  if (!data.created) return { ok: true, message: tb.alreadySaved };
  const settings = await getSettings(supabase);
  const delivery = await sendBookingEmails({
    name: student.full_name, email: student.email, when: formatDateTime(data.starts_at, student.timezone ?? settings.timezone),
    teacherWhen: formatDateTime(data.starts_at, settings.timezone),
    creditsUsed: data.credits_used,
  });
  return { ok: true, message: delivery.ok ? tb.saved : tb.savedWithoutEmail };
}

/** Refunds only the credit actually used and emails the student. */
export async function cancelLesson(bookingId: string, message: string): Promise<ActionResult> {
  const { supabase } = await requireTeacher();
  const text = message.trim();
  if (!text) return fail(t.admin.lessonModal.messageRequired);

  const { data, error } = await supabase.rpc("cancel_lesson", { p_booking_id: bookingId, p_message: text });
  if (error || !data) {
    console.error("[admin] cancel_lesson", error);
    return fail();
  }

  const booking = data as { student_id: string; starts_at: string; credits_used: number };
  const [{ data: student }, settings] = await Promise.all([
    supabase.from("profiles").select("full_name, email, timezone").eq("id", booking.student_id).maybeSingle(),
    getSettings(supabase),
  ]);

  let delivered = false;
  if (student) {
    const delivery = await sendCancellationNotice({
      name: student.full_name,
      email: student.email,
      when: formatDateTime(booking.starts_at, student.timezone),
      message: text,
      refundedCredits: booking.credits_used,
    });
    delivered = delivery.ok;
  }

  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: delivered
    ? booking.credits_used === 0 ? tb.cancelledGift : t.admin.lessonModal.cancelled
    : tb.cancelledWithoutEmail };
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
