import { requireStudent, getSettings } from "@/lib/auth";
import { BookingCalendar } from "@/components/dashboard/BookingCalendar";
import { generateAvailableSlots, studentBookingSlots, type BusyRange } from "@/lib/slots";
import { addDaysKey, formatDateTime, localToUtc, todayKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { teacherBookingText as tb } from "@/lib/i18n/teacher-booking";
import type { BlockedSlot, Booking, WeeklyAvailability, CreditBatch } from "@/lib/types";
import { CreditExpiryList } from "@/components/CreditExpiryList";
import { CancelLessonButton } from "@/components/dashboard/CancelLessonButton";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";

export default async function BookingPage() {
  const { supabase, profile } = await requireStudent();
  const settings = await getSettings(supabase);
  const tz = settings.timezone;
  const today = todayKey(tz);
  const lastDay = addDaysKey(today, settings.booking_window_days);
  const b = t.dashboard.booking;

  const [{ data: weekly, error: weeklyError }, { data: blocked, error: blockedError }, { data: busy, error: busyError },
    { data: mine, error: mineError }, { data: batchData, error: batchError }] = await Promise.all([
    supabase.from("weekly_availability").select("*"),
    supabase.from("blocked_slots").select("id, day, start_time, end_time").gte("day", today).lte("day", lastDay),
    supabase.rpc("get_busy_slots", {
      p_from: new Date().toISOString(),
      p_to: localToUtc(addDaysKey(lastDay, 1), 0, tz).toISOString(),
    }),
    supabase
      .from("bookings")
      .select("*")
      .eq("student_id", profile.id)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at"),
    supabase.from("credit_batches").select("id,remaining,expires_at").eq("student_id", profile.id)
      .gt("remaining", 0).gt("expires_at", new Date().toISOString()).order("expires_at"),
  ]);
  const loadError = weeklyError ?? blockedError ?? busyError ?? mineError ?? batchError;
  if (loadError) {
    console.error("[dashboard] Booking data unavailable", loadError.code);
    throw new Error(t.common.error);
  }
  const batches = (batchData ?? []) as CreditBatch[];

  const generated = generateAvailableSlots({
    settings,
    weekly: (weekly ?? []) as WeeklyAvailability[],
    blocked: (blocked ?? []) as BlockedSlot[],
    busy: (busy ?? []) as BusyRange[],
  });
  const slots = studentBookingSlots(generated, profile.timezone, batches);
  const days = [...new Set(slots.map((slot) => slot.dayKey))].sort();
  const myLessons = (mine ?? []) as Booking[];

  return (
    <div className="space-y-10">
      <section className="card">
        <h1 className="text-3xl font-bold">{b.title}</h1>
        <p className="mb-6 mt-2 text-lg text-stone-600">
          {b.intro}
          <br />
          <span className="text-base">{t.common.timezoneNote(profile.timezone)}</span>
        </p>
        <div className="mb-6 space-y-2 rounded-xl bg-amber-50 p-4">
          <p>{r.cancellation}</p><p>{r.validity(settings.credit_validity_months)}</p><p>{r.refund}</p>
        </div>
        <BookingCalendar slots={slots} days={days} credits={profile.credits} timezone={profile.timezone} />
      </section>
      <CreditExpiryList batches={batches} timezone={profile.timezone} />

      <section className="card">
        <h2 className="mb-4 text-2xl font-bold">{b.myLessons}</h2>
        {myLessons.length === 0 ? (
          <p className="text-lg text-stone-600">{b.noLessons}</p>
        ) : (
          <ul className="space-y-3">
            {myLessons.map((lesson) => (
              <li
                key={lesson.id}
                className={`rounded-xl p-4 text-lg ${
                  lesson.status === "booked" ? "bg-emerald-50 font-semibold" : "bg-stone-100 text-stone-500"
                }`}
              >
                <span className={lesson.status === "cancelled" ? "line-through" : ""}>
                  📅 {formatDateTime(lesson.starts_at, profile.timezone)}
                </span>
                {lesson.status === "cancelled" && (
                  <p className="mt-1 text-base">
                    ❌ {r.cancelled}
                    {lesson.cancel_message ? ` — “${lesson.cancel_message}”` : ""}
                  </p>
                )}
                {lesson.credits_used === 0 && <p className="mt-1 text-base">{tb.giftLabel}</p>}
                {lesson.status === "booked" && <CancelLessonButton id={lesson.id}
                  allowed={Date.parse(lesson.starts_at) >= Date.now() + 86400_000} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
