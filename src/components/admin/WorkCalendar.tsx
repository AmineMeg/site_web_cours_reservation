"use client";

import Link from "next/link";
import { useState } from "react";
import { LessonModal, type LessonItem } from "@/components/admin/LessonModal";
import { buttonClass } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { teacherBookingText as tb } from "@/lib/i18n/teacher-booking";

export interface CalendarDay {
  key: string;
  label: string;
  isToday: boolean;
  lessons: LessonItem[];
}

export function WorkCalendar({
  days,
  weekLabel,
  week,
}: {
  days: CalendarDay[];
  weekLabel: string;
  week: number;
}) {
  const l = t.admin.schedule.lessons;
  const [selected, setSelected] = useState<LessonItem | null>(null);
  const href = (w: number) => `/admin/schedule?view=lessons&w=${w}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={href(week - 1)} className={buttonClass("secondary", "lg")}>
          {l.previousWeek}
        </Link>
        <div className="text-center">
          <p className="text-xl font-bold">{l.weekOf(weekLabel)}</p>
          {week !== 0 && (
            <Link href={href(0)} className="text-brand-700 underline">
              {l.thisWeek}
            </Link>
          )}
        </div>
        <Link href={href(week + 1)} className={buttonClass("secondary", "lg")}>
          {l.nextWeek}
        </Link>
      </div>

      <p className="mb-4 text-lg text-stone-600">{l.intro}</p>

      <ol className="grid gap-3 lg:grid-cols-7">
        {days.map((day) => (
          <li
            key={day.key}
            className={`rounded-2xl border-2 p-3 ${day.isToday ? "border-brand-500 bg-brand-50" : "border-stone-200 bg-white"}`}
          >
            <h3 className="mb-2 font-bold capitalize">{day.label}</h3>
            {day.lessons.length === 0 ? (
              <p className="text-sm text-stone-400">{l.noLessons}</p>
            ) : (
              <ul className="space-y-2">
                {day.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(lesson)}
                      className="w-full rounded-xl bg-emerald-600 px-3 py-3 text-left text-white shadow-sm hover:bg-emerald-700"
                    >
                      <span className="block text-lg font-bold">{lesson.timeLabel}</span>
                      <span className="block truncate">{lesson.student?.full_name || lesson.student?.email}</span>
                      {lesson.creditsUsed === 0 && <span className="block text-sm">{tb.giftLabel}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <LessonModal lesson={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
