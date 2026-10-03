import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeacher, getSettings } from "@/lib/auth";
import { StudentEditForm } from "@/components/admin/StudentEditForm";
import { CreditControl } from "@/components/admin/CreditControl";
import { formatDateTime, todayKey } from "@/lib/dates";
import { AddLessonButton } from "@/components/admin/AddLessonButton";
import { teacherBookingText as tb } from "@/lib/i18n/teacher-booking";
import { t } from "@/lib/i18n";
import type { Booking, Profile } from "@/lib/types";
import { CreditExpiryList } from "@/components/CreditExpiryList";
import type { CreditBatch } from "@/lib/types";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireTeacher();
  const d = t.admin.studentDetail;

  const [{ data: student }, { data: lessons }, settings] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).eq("role", "student").maybeSingle(),
    supabase
      .from("bookings")
      .select("*")
      .eq("student_id", id)
      .eq("status", "booked")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at"),
    getSettings(supabase),
  ]);
  if (!student) notFound();
  const profile = student as Profile;
  const upcoming = (lessons ?? []) as Booking[];
  const { data: batchData, error: batchError } = await supabase.from("credit_batches")
    .select("id,remaining,expires_at").eq("student_id", id).gt("remaining", 0)
    .gt("expires_at", new Date().toISOString()).order("expires_at");
  if (batchError) {
    console.error("[admin] Credit batches unavailable", batchError.code);
    throw new Error(t.common.error);
  }

  return (
    <>
      <Link href="/admin/students" className="mb-6 inline-block text-lg font-medium text-stone-700 hover:text-brand-700">
        {d.back}
      </Link>
      <h1 className="mb-8 text-3xl font-bold sm:text-4xl">{profile.full_name || profile.email}</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <StudentEditForm student={profile} />
        <div className="space-y-6">
          <CreditControl studentId={profile.id} initialCredits={profile.credits} validityMonths={settings.credit_validity_months} />
          <CreditExpiryList batches={(batchData ?? []) as CreditBatch[]} timezone={profile.timezone} />
          {profile.is_active && <AddLessonButton students={[profile]} today={todayKey(settings.timezone)}
            timezone={settings.timezone} lessonMinutes={settings.lesson_minutes} initialStudentId={profile.id} />}
          <div className="card">
            <h2 className="mb-3 text-xl font-bold">📅 {d.upcoming}</h2>
            {upcoming.length === 0 ? (
              <p className="text-stone-600">{d.noUpcoming}</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((b) => (
                  <li key={b.id} className="rounded-xl bg-stone-50 px-3 py-2 font-medium">
                    {formatDateTime(b.starts_at, settings.timezone)}
                    {b.credits_used === 0 && <span className="mt-1 block text-sm text-brand-700">{tb.giftLabel}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {profile.phone && (
            <a href={`tel:${profile.phone}`} className="card block text-center text-xl font-bold text-brand-700">
              📞 {t.common.call} {profile.phone}
            </a>
          )}
        </div>
      </div>
    </>
  );
}
