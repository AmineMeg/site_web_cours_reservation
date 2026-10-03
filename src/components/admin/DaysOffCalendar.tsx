"use client";

import { useMemo, useState, useTransition } from "react";
import { blockHours, blockWholeDay, unblock, unblockDay } from "@/app/admin/actions";
import { Notice } from "@/components/ui/Notice";
import { buttonClass } from "@/components/ui/button";
import {
  addDaysKey,
  addMonthsKey,
  formatDayKey,
  minutesToTime,
  timeToMinutes,
  weekdayNames,
  weekdayOfKey,
} from "@/lib/dates";
import { daySlotStarts } from "@/lib/slots";
import { t } from "@/lib/i18n";
import type { BlockedSlot, WeeklyAvailability } from "@/lib/types";

export function DaysOffCalendar({
  today,
  blocked,
  weekly,
  lessonMinutes,
  lessonCounts,
}: {
  today: string;
  blocked: BlockedSlot[];
  weekly: WeeklyAvailability[];
  lessonMinutes: number;
  lessonCounts: Record<string, number>;
}) {
  const d = t.admin.schedule.daysOff;
  const [month, setMonth] = useState(today.slice(0, 8) + "01");
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byDay = useMemo(() => {
    const map: Record<string, BlockedSlot[]> = {};
    for (const b of blocked) (map[b.day] ??= []).push(b);
    return map;
  }, [blocked]);

  const shortNames = weekdayNames("short");
  const headers = [1, 2, 3, 4, 5, 6, 0].map((i) => shortNames[i]);

  const cells: (string | null)[] = [];
  for (let i = 0; i < (weekdayOfKey(month) + 6) % 7; i++) cells.push(null);
  for (let day = month; day.slice(0, 7) === month.slice(0, 7); day = addDaysKey(day, 1)) cells.push(day);

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    startTransition(async () => {
      const res = await fn();
      setError(res.ok ? null : res.message);
    });

  const isWorkingDay = (day: string) => weekly.some((w) => w.weekday === weekdayOfKey(day) && w.is_active);
  const wholeDay = (day: string) => (byDay[day] ?? []).find((b) => b.start_time === null);

  const upcoming = Object.keys(byDay).filter((k) => k >= today).sort();

  return (
    <div className="space-y-6">
      <p className="text-lg text-stone-600">{d.intro}</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Month calendar */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between gap-2">
            <button type="button" onClick={() => setMonth(addMonthsKey(month, -1))} disabled={month <= today.slice(0, 8) + "01"} className={buttonClass("secondary", "md")}>
              {d.previousMonth}
            </button>
            <h3 className="text-xl font-bold capitalize">{formatDayKey(month, { month: "long", year: "numeric" })}</h3>
            <button type="button" onClick={() => setMonth(addMonthsKey(month, 1))} className={buttonClass("secondary", "md")}>
              {d.nextMonth}
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-sm font-semibold capitalize text-stone-500">
            {headers.map((h) => (
              <div key={h}>{h}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />;
              const past = day < today;
              const full = !!wholeDay(day);
              const partial = !full && (byDay[day]?.length ?? 0) > 0;
              const working = isWorkingDay(day);
              const style = full
                ? "bg-red-600 text-white"
                : partial
                  ? "bg-orange-200 text-orange-950"
                  : working
                    ? "bg-emerald-50 text-stone-900 hover:bg-emerald-100"
                    : "bg-stone-100 text-stone-400";
              return (
                <button
                  key={day}
                  type="button"
                  disabled={past}
                  onClick={() => {
                    setSelected(day);
                    setError(null);
                  }}
                  aria-pressed={selected === day}
                  className={`relative aspect-square rounded-xl text-lg font-bold transition ${style} ${
                    selected === day ? "ring-4 ring-brand-500" : ""
                  } disabled:cursor-not-allowed disabled:opacity-30`}
                >
                  {Number(day.slice(8))}
                  {lessonCounts[day] ? <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-emerald-600" /> : null}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-stone-600">
            <span className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-red-600" /> {d.wholeDay}</span>
            <span className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-orange-200" /> {d.blocked}</span>
            <span className="flex items-center gap-2"><span className="h-4 w-4 rounded bg-emerald-50 ring-1 ring-emerald-200" /> {d.free}</span>
          </div>
        </div>

        {/* Selected day panel */}
        <div className="card space-y-4">
          {!selected ? (
            <p className="text-lg text-stone-600">👈 {d.selectDay}</p>
          ) : (
            <>
              <h3 className="text-2xl font-bold capitalize">{formatDayKey(selected, { weekday: "long", day: "numeric", month: "long" })}</h3>
              {lessonCounts[selected] ? <Notice ok={false}>{d.hasLessons(lessonCounts[selected])}</Notice> : null}

              {wholeDay(selected) ? (
                <>
                  <p className="rounded-xl bg-red-50 p-4 text-lg font-semibold text-red-800">⛔ {d.wholeDayBlocked}</p>
                  <button type="button" disabled={pending} onClick={() => run(() => unblockDay(selected))} className={buttonClass("success", "xl", "w-full")}>
                    {d.unblockWholeDay}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" disabled={pending} onClick={() => run(() => blockWholeDay(selected))} className={buttonClass("danger", "xl", "w-full")}>
                    ⛔ {d.blockWholeDay}
                  </button>
                  {isWorkingDay(selected) ? (
                    <>
                      <p className="text-lg text-stone-700">{d.orBlockHours}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {daySlotStarts(selected, weekly, lessonMinutes).map((start) => {
                          const end = start + lessonMinutes;
                          const block = (byDay[selected] ?? []).find(
                            (b) => b.start_time && b.end_time && timeToMinutes(b.start_time) < end && timeToMinutes(b.end_time) > start,
                          );
                          return (
                            <button
                              key={start}
                              type="button"
                              disabled={pending}
                              aria-pressed={!!block}
                              onClick={() =>
                                run(() => (block ? unblock(block.id) : blockHours(selected, minutesToTime(start), minutesToTime(end))))
                              }
                              className={`min-h-14 rounded-xl text-lg font-semibold ${
                                block ? "bg-orange-500 text-white" : "bg-emerald-50 text-emerald-900 ring-2 ring-emerald-200"
                              }`}
                            >
                              {minutesToTime(start)} · {block ? d.blocked : d.free}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="text-stone-600">{d.notWorkingDay}</p>
                  )}
                </>
              )}
              {error && <Notice ok={false}>{error}</Notice>}
            </>
          )}
        </div>
      </div>

      {/* Upcoming days off */}
      <div className="card">
        <h3 className="mb-4 text-xl font-bold">{d.upcomingTitle}</h3>
        {upcoming.length === 0 ? (
          <p className="text-stone-600">{d.none}</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {upcoming.map((day) => (
              <li key={day} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-lg font-semibold capitalize">{formatDayKey(day, { weekday: "long", day: "numeric", month: "long" })}</p>
                  <p className="text-stone-600">
                    {wholeDay(day)
                      ? d.wholeDay
                      : byDay[day]
                          .map((b) => `${minutesToTime(timeToMinutes(b.start_time!))}–${minutesToTime(timeToMinutes(b.end_time!))}`)
                          .sort()
                          .join(", ")}
                  </p>
                </div>
                <button type="button" disabled={pending} onClick={() => run(() => unblockDay(day))} className={buttonClass("secondary", "md")}>
                  🗑️ {d.unblock}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
