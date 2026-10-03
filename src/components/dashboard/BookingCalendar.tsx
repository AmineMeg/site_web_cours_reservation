"use client";

import { useMemo, useState, useTransition } from "react";
import { bookLesson } from "@/app/dashboard/actions";
import { Modal } from "@/components/ui/Modal";
import { Notice } from "@/components/ui/Notice";
import { buttonClass } from "@/components/ui/button";
import { formatDateTime, formatDayKey, formatTime } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { ActionResult } from "@/lib/types";
import type { Slot } from "@/lib/slots";

export function BookingCalendar({
  slots,
  days,
  credits,
  timezone,
}: {
  slots: Slot[];
  days: string[];
  credits: number;
  timezone: string;
}) {
  const b = t.dashboard.booking;
  const byDay = useMemo(() => {
    const map: Record<string, Slot[]> = {};
    for (const s of slots) (map[s.dayKey] ??= []).push(s);
    return map;
  }, [slots]);

  const [selectedDay, setSelectedDay] = useState<string | null>(() => days.find((d) => byDay[d]?.length) ?? null);
  const [chosen, setChosen] = useState<Slot | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const res = await bookLesson(chosen!.startsAt);
      setResult(res);
      setChosen(null);
    });

  if (credits < 1) {
    return <Notice ok={false}>{b.noCredits}</Notice>;
  }

  if (slots.length === 0) {
    return (
      <div className="space-y-4">
        {result && <Notice ok={result.ok}>{result.message}</Notice>}
        <p className="card text-center text-lg text-stone-600">{b.noSlots}</p>
      </div>
    );
  }

  const daySlots = selectedDay ? byDay[selectedDay] ?? [] : [];

  return (
    <div className="space-y-6">
      {result && <Notice ok={result.ok}>{result.message}</Notice>}

      <section>
        <h3 className="mb-3 text-xl font-bold">1. {b.chooseDay}</h3>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {days.map((day) => {
            const count = byDay[day]?.length ?? 0;
            const active = day === selectedDay;
            return (
              <button
                key={day}
                type="button"
                disabled={count === 0}
                onClick={() => setSelectedDay(day)}
                aria-pressed={active}
                className={`flex min-w-20 shrink-0 flex-col items-center rounded-2xl px-3 py-3 font-semibold transition ${
                  active
                    ? "bg-brand-700 text-white"
                    : count
                      ? "bg-white text-stone-900 ring-2 ring-stone-200 hover:ring-brand-400"
                      : "bg-stone-100 text-stone-400"
                } disabled:cursor-not-allowed`}
              >
                <span className="text-sm capitalize">{formatDayKey(day, { weekday: "short" })}</span>
                <span className="text-2xl">{Number(day.slice(8))}</span>
                <span className="text-xs capitalize">{formatDayKey(day, { month: "short" })}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xl font-bold">2. {b.chooseTime}</h3>
        {daySlots.length === 0 ? (
          <p className="text-stone-600">{b.noSlotsDay}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {daySlots.map((slot) => (
              <button
                key={slot.startsAt}
                type="button"
                onClick={() => {
                  setResult(null);
                  setChosen(slot);
                }}
                className="min-h-16 rounded-2xl bg-emerald-50 text-xl font-bold text-emerald-900 ring-2 ring-emerald-300 hover:bg-emerald-100"
              >
                {formatTime(slot.startsAt, timezone)}
              </button>
            ))}
          </div>
        )}
      </section>

      <Modal open={!!chosen} onClose={() => setChosen(null)} title={`3. ${b.confirmTitle}`}>
        {chosen && (
          <div className="space-y-4">
            <p className="text-xl">{b.confirmText(formatDateTime(chosen.startsAt, timezone))}</p>
            <button type="button" onClick={confirm} disabled={pending} className={buttonClass("success", "xl", "w-full")}>
              {pending ? b.booking : `✅ ${b.confirm}`}
            </button>
            <button type="button" onClick={() => setChosen(null)} disabled={pending} className={buttonClass("secondary", "lg", "w-full")}>
              {t.common.cancel}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
