"use client";

import { useMemo, useState, useTransition } from "react";
import { changeTrial } from "@/app/trial/[token]/actions";
import { dayKeyOf, formatDateTime, formatDayKey, formatTime } from "@/lib/dates";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { t } from "@/lib/i18n";
import { Notice } from "@/components/ui/Notice";
import { Modal } from "@/components/ui/Modal";
import { buttonClass } from "@/components/ui/button";
import type { ActionResult, TrialBooking } from "@/lib/types";

export function TrialCalendar({ token, timezone, slots, booking }: {
  token: string; timezone: string; slots: { startsAt: string; endsAt: string }[]; booking: TrialBooking | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const byDay = useMemo(() => {
    const grouped: Record<string, typeof slots> = {};
    for (const slot of slots) (grouped[dayKeyOf(slot.startsAt, timezone)] ??= []).push(slot);
    return grouped;
  }, [slots, timezone]);
  function change(start: string | null) {
    startTransition(async () => {
      setResult(await changeTrial(token, start));
      setSelected(null);
    });
  }
  return <div className="space-y-6">
    {result && <Notice ok={result.ok}>{result.message}</Notice>}
    <p className="text-lg">{t.common.timezoneNote(timezone)}</p>
    <p className="rounded-xl bg-amber-50 p-4">{r.cancellation}</p>
    {booking ? <section className="card space-y-4">
      <h2 className="text-2xl font-bold">{r.trialBooked}</h2>
      <p className="text-xl">{formatDateTime(booking.starts_at, timezone)}</p>
      <p>{r.trialLabel}</p>
      <p>{r.trialCancelNote}</p>
      <button disabled={pending || Date.parse(booking.starts_at) < Date.now() + 86400_000}
        onClick={() => { if (window.confirm(r.cancelConfirm)) change(null); }}
        className={buttonClass("danger", "lg")}>{r.trialCancel}</button>
    </section> : <>
      {slots.length === 0 && <p className="card">{t.dashboard.booking.noSlots}</p>}
      {Object.entries(byDay).map(([day, list]) => <section key={day} className="card">
        <h2 className="mb-4 text-xl font-bold">{formatDayKey(day, { weekday: "long", day: "numeric", month: "long" })}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {list.map((slot) => <button key={slot.startsAt} onClick={() => setSelected(slot.startsAt)} disabled={pending}
            className={buttonClass("success", "lg")}>{formatTime(slot.startsAt, timezone)}</button>)}
        </div>
      </section>)}
    </>}
    <Modal open={!!selected} onClose={() => { if (!pending) setSelected(null); }} title={r.trialTitle}>
      {selected && <div className="space-y-4">
        <p className="text-xl">{formatDateTime(selected, timezone)}</p>
        <p>{r.trialLabel}</p>
        <button disabled={pending} onClick={() => change(selected)} className={buttonClass("success", "xl", "w-full")}>
          {pending ? t.dashboard.booking.booking : t.dashboard.booking.confirm}
        </button>
      </div>}
    </Modal>
  </div>;
}
