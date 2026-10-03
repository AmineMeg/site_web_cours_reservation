"use client";

import { useState, useTransition } from "react";
import { saveWeeklyHours } from "@/app/admin/actions";
import { Notice } from "@/components/ui/Notice";
import { buttonClass } from "@/components/ui/button";
import { minutesToTime, timeToMinutes, weekdayNames } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { ActionResult, WeeklyAvailability } from "@/lib/types";

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const OPTIONS = Array.from({ length: (23 - 6) * 2 + 1 }, (_, i) => minutesToTime(6 * 60 + i * 30)); // 06:00 → 23:00

const hhmm = (time: string) => minutesToTime(timeToMinutes(time));

export function WeeklyHoursEditor({ initial }: { initial: WeeklyAvailability[] }) {
  const h = t.admin.schedule.hours;
  const names = weekdayNames();
  const [rows, setRows] = useState<WeeklyAvailability[]>(() =>
    Array.from({ length: 7 }, (_, weekday) => {
      const r = initial.find((x) => x.weekday === weekday);
      return {
        weekday,
        is_active: r?.is_active ?? false,
        start_time: hhmm(r?.start_time ?? "09:00"),
        end_time: hhmm(r?.end_time ?? "17:00"),
      };
    }),
  );
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (weekday: number, patch: Partial<WeeklyAvailability>) => {
    setResult(null);
    setRows((prev) => prev.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
  };

  const save = () => startTransition(async () => setResult(await saveWeeklyHours(rows)));

  const options = (current: string) => (OPTIONS.includes(current) ? OPTIONS : [...OPTIONS, current].sort());

  return (
    <div className="space-y-4">
      <p className="text-lg text-stone-600">{h.intro}</p>
      <ul className="space-y-3">
        {DISPLAY_ORDER.map((weekday) => {
          const row = rows[weekday];
          return (
            <li
              key={weekday}
              className={`flex flex-col gap-4 rounded-2xl border-2 p-4 sm:flex-row sm:items-center ${
                row.is_active ? "border-emerald-300 bg-emerald-50" : "border-stone-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-4 sm:w-72">
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.is_active}
                  aria-label={names[weekday]}
                  onClick={() => update(weekday, { is_active: !row.is_active })}
                  className={`relative h-10 w-20 shrink-0 rounded-full transition-colors ${row.is_active ? "bg-emerald-600" : "bg-stone-300"}`}
                >
                  <span
                    className={`absolute top-1 h-8 w-8 rounded-full bg-white shadow transition-all ${row.is_active ? "left-11" : "left-1"}`}
                  />
                </button>
                <div>
                  <p className="text-xl font-bold capitalize">{names[weekday]}</p>
                  <p className={row.is_active ? "font-medium text-emerald-800" : "text-stone-500"}>
                    {row.is_active ? h.working : h.notWorking}
                  </p>
                </div>
              </div>
              {row.is_active && (
                <div className="flex flex-wrap items-center gap-3 text-lg">
                  <label className="flex items-center gap-2">
                    {h.from}
                    <select
                      value={row.start_time}
                      onChange={(e) => update(weekday, { start_time: e.target.value })}
                      className="h-14 rounded-xl border-2 border-stone-300 bg-white px-3 text-xl font-semibold"
                    >
                      {options(row.start_time).map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    {h.to}
                    <select
                      value={row.end_time}
                      onChange={(e) => update(weekday, { end_time: e.target.value })}
                      className="h-14 rounded-xl border-2 border-stone-300 bg-white px-3 text-xl font-semibold"
                    >
                      {options(row.end_time).map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {result && <Notice ok={result.ok}>{result.message}</Notice>}
      <button type="button" onClick={save} disabled={pending} className={buttonClass("primary", "xl", "w-full sm:w-auto")}>
        {pending ? t.common.saving : `💾 ${t.common.save}`}
      </button>
    </div>
  );
}
