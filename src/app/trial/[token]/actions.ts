"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTrialContext, trialHash } from "@/lib/trial";
import { getSettings } from "@/lib/auth";
import { sendTrialBookingEmails } from "@/lib/notifications";
import { formatDateTime } from "@/lib/dates";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { t } from "@/lib/i18n";
import type { ActionResult, TrialBooking } from "@/lib/types";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export async function changeTrial(token: string, startsAt: string | null): Promise<ActionResult> {
  const hash = trialHash(token);
  if (!hash) return { ok: false, message: r.expired };
  if (!await consumeRateLimit("trialChange", hash)) return { ok: false, message: r.tooMany };
  const { data: context, error: contextError } = await getTrialContext(token);
  if (!context) return { ok: false, message: contextError === "LINK_EXPIRED" ? r.expired : t.common.error };
  if (startsAt !== null && !Number.isFinite(Date.parse(startsAt))) return { ok: false, message: t.common.error };
  const admin = createAdminClient();
  const settings = await getSettings(admin);
  const { data, error } = startsAt === null
    ? await admin.rpc("cancel_trial", { p_hash: hash })
    : await admin.rpc("book_trial", { p_hash: hash, p_start: startsAt });
  if (error || !data) {
    const errors: Record<string, string> = {
      LINK_EXPIRED: r.expired, CANCELLATION_TOO_LATE: r.tooLate,
      SLOT_NOT_AVAILABLE: t.dashboard.booking.errors.SLOT_NOT_AVAILABLE,
      TRIAL_ALREADY_BOOKED: r.duplicate, BOOKING_NOT_FOUND: t.common.error,
    };
    const code = Object.keys(errors).find((key) => error?.message.includes(key));
    if (!code) console.error("[trial] Booking change failed", error?.code);
    return { ok: false, message: code ? errors[code] : t.common.error };
  }
  const booking = data as TrialBooking;
  const delivery = await sendTrialBookingEmails({
    name: context.contact.name, email: context.contact.email,
    when: formatDateTime(booking.starts_at, context.contact.timezone),
    teacherWhen: formatDateTime(booking.starts_at, settings.timezone),
    cancelled: startsAt === null,
  });
  revalidatePath(`/trial/${token}`);
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: startsAt === null
    ? delivery.ok ? r.cancelled : r.cancelledWithoutEmail
    : delivery.ok ? r.trialBooked : r.bookedWithoutEmail };
}
