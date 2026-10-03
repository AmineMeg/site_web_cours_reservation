import Link from "next/link";
import { requireTeacher, getSettings } from "@/lib/auth";
import { WorkCalendar, type CalendarDay } from "@/components/admin/WorkCalendar";
import { WeeklyHoursEditor } from "@/components/admin/WeeklyHoursEditor";
import { DaysOffCalendar } from "@/components/admin/DaysOffCalendar";
import { AddLessonButton, type BookingStudent } from "@/components/admin/AddLessonButton";
import { teacherBookingText as tb } from "@/lib/i18n/teacher-booking";
import { PageTitle } from "@/components/ui/Notice";
import {
  addDaysKey,
  dayKeyOf,
  formatDateTime,
  formatDayKey,
  formatTime,
  localToUtc,
  mondayOfKey,
  todayKey,
} from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { BlockedSlot, BookingWithStudent, WeeklyAvailability } from "@/lib/types";

type View = "lessons" | "hours" | "daysoff";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; w?: string; student?: string }>;
}) {
  const params = await searchParams;
  const view: View = params.view === "hours" || params.view === "daysoff" ? params.view : "lessons";
  const { supabase } = await requireTeacher();
  const settings = await getSettings(supabase);
  const tz = settings.timezone;
  const today = todayKey(tz);
  const s = t.admin.schedule;
  const { data: studentData, error: studentError } = await supabase.from("profiles")
    .select("id,full_name,email,credits").eq("role", "student").eq("is_active", true).order("full_name");
  if (studentError) {
    console.error("[admin] Booking students unavailable", studentError.code);
    throw new Error(tb.loadError);
  }
  const students: BookingStudent[] = studentData ?? [];
  const initialStudentId = students.some((student) => student.id === params.student) ? params.student : undefined;

  const tabs: { id: View; label: string; icon: string }[] = [
    { id: "lessons", label: s.tabs.lessons, icon: "👩‍🏫" },
    { id: "hours", label: s.tabs.hours, icon: "🕘" },
    { id: "daysoff", label: s.tabs.daysOff, icon: "🏖️" },
  ];

  let content: React.ReactNode;

  if (view === "lessons") {
    const week = Math.max(-52, Math.min(52, Math.trunc(Number(params.w) || 0)));
    const monday = addDaysKey(mondayOfKey(today), week * 7);
    const from = localToUtc(monday, 0, tz).toISOString();
    const to = localToUtc(addDaysKey(monday, 7), 0, tz).toISOString();

    const { data } = await supabase
      .from("bookings")
      .select("*, student:profiles(id, full_name, email, phone, objectives, credits)")
      .eq("status", "booked")
      .gte("starts_at", from)
      .lt("starts_at", to)
      .order("starts_at");
    const bookings = (data ?? []) as BookingWithStudent[];

    const days: CalendarDay[] = Array.from({ length: 7 }, (_, i) => {
      const key = addDaysKey(monday, i);
      return {
        key,
        label: formatDayKey(key, { weekday: "long", day: "numeric", month: "short" }),
        isToday: key === today,
        lessons: bookings
          .filter((b) => dayKeyOf(b.starts_at, tz) === key)
          .map((b) => ({
            id: b.id,
            creditsUsed: b.credits_used,
            timeLabel: `${formatTime(b.starts_at, tz)} – ${formatTime(b.ends_at, tz)}`,
            whenLabel: formatDateTime(b.starts_at, tz),
            student: b.student,
          })),
      };
    });

    content = (
      <WorkCalendar days={days} week={week} weekLabel={formatDayKey(monday, { day: "numeric", month: "long", year: "numeric" })} />
    );
  } else {
    const { data: weeklyData } = await supabase.from("weekly_availability").select("*").order("weekday");
    const weekly = (weeklyData ?? []) as WeeklyAvailability[];

    if (view === "hours") {
      content = <WeeklyHoursEditor initial={weekly} />;
    } else {
      const [{ data: blockedData }, { data: lessonData }] = await Promise.all([
        supabase.from("blocked_slots").select("id, day, start_time, end_time").gte("day", today).order("day"),
        supabase
          .from("bookings")
          .select("starts_at")
          .eq("status", "booked")
          .gte("starts_at", localToUtc(today, 0, tz).toISOString()),
      ]);
      const lessonCounts: Record<string, number> = {};
      for (const b of lessonData ?? []) {
        const key = dayKeyOf(b.starts_at as string, tz);
        lessonCounts[key] = (lessonCounts[key] ?? 0) + 1;
      }
      content = (
        <DaysOffCalendar
          today={today}
          blocked={(blockedData ?? []) as BlockedSlot[]}
          weekly={weekly}
          lessonMinutes={settings.lesson_minutes}
          lessonCounts={lessonCounts}
        />
      );
    }
  }

  return (
    <>
      <PageTitle title={s.title} intro={t.common.timezoneNote(tz)} />
      <div className="mb-6">
        <AddLessonButton students={students} today={today} timezone={tz} lessonMinutes={settings.lesson_minutes} initialStudentId={initialStudentId} />
      </div>
      <nav className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/admin/schedule?view=${tab.id}`}
            aria-current={view === tab.id ? "page" : undefined}
            className={`flex min-h-16 items-center justify-center gap-3 rounded-2xl text-xl font-bold transition-colors ${
              view === tab.id ? "bg-brand-700 text-white shadow" : "bg-white text-stone-800 ring-2 ring-stone-200 hover:bg-stone-100"
            }`}
          >
            <span aria-hidden>{tab.icon}</span> {tab.label}
          </Link>
        ))}
      </nav>
      {content}
    </>
  );
}
