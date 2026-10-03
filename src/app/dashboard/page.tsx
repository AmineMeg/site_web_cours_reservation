import { requireStudent, getSettings } from "@/lib/auth";
import { BookingCalendar } from "@/components/dashboard/BookingCalendar";
import { generateAvailableSlots, type BusyRange } from "@/lib/slots";
import { addDaysKey, formatDateTime, localToUtc, todayKey } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { BlockedSlot, Booking, WeeklyAvailability } from "@/lib/types";

export default async function BookingPage() {
  const { supabase, profile } = await requireStudent();
  const settings = await getSettings(supabase);
  const tz = settings.timezone;
  const today = todayKey(tz);
  const lastDay = addDaysKey(today, settings.booking_window_days);
  const b = t.dashboard.booking;

  const [{ data: weekly }, { data: blocked }, { data: busy }, { data: mine }] = await Promise.all([
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
  ]);

  const slots = generateAvailableSlots({
    settings,
    weekly: (weekly ?? []) as WeeklyAvailability[],
    blocked: (blocked ?? []) as BlockedSlot[],
    busy: (busy ?? []) as BusyRange[],
  });
  const days = Array.from({ length: settings.booking_window_days + 1 }, (_, i) => addDaysKey(today, i));
  const myLessons = (mine ?? []) as Booking[];

  return (
    <div className="space-y-10">
      <section className="card">
        <h1 className="text-3xl font-bold">{b.title}</h1>
        <p className="mb-6 mt-2 text-lg text-stone-600">
          {b.intro}
          <br />
          <span className="text-base">{t.common.timezoneNote(tz)}</span>
        </p>
        <BookingCalendar slots={slots} days={days} credits={profile.credits} timezone={tz} />
      </section>

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
                  📅 {formatDateTime(lesson.starts_at, tz)}
                </span>
                {lesson.status === "cancelled" && (
                  <p className="mt-1 text-base">
                    ❌ {b.cancelledByTeacher}
                    {lesson.cancel_message ? ` — “${lesson.cancel_message}”` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
