"use client";

import { useEffect, useMemo, useState } from "react";
import { ContactForm } from "./ContactForm";
import { browserTimezone } from "@/lib/timezones";
import { dayKeyOf, formatDayKey, formatTime } from "@/lib/dates";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { t } from "@/lib/i18n";
import { Notice } from "@/components/ui/Notice";
import { buttonClass } from "@/components/ui/button";
import type { HomepageContent } from "@/lib/website-content";
import type { TrialSlot } from "@/lib/public-trial";

export function TrialOnboarding({ content, slots, preview = false }: {
  content: HomepageContent; slots: TrialSlot[]; preview?: boolean;
}) {
  const [timezone, setTimezone] = useState("");
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    if (preview) return;
    try {
      setTimezone(browserTimezone());
    } catch {
      setFailed(true);
    }
  }, [preview]);
  const byDay = useMemo(() => {
    const grouped: Record<string, TrialSlot[]> = {};
    if (timezone) for (const slot of slots) (grouped[dayKeyOf(slot.startsAt, timezone)] ??= []).push(slot);
    return grouped;
  }, [slots, timezone]);
  const days = Object.keys(byDay).sort();
  const activeDay = day && byDay[day] ? day : days[0];

  if (preview) return <div className="space-y-6">
    <section className="rounded-xl bg-emerald-50 p-4">
      <h3 className="text-xl font-bold">{r.chooseTrial}</h3>
      <p>{r.publicTrialInfo}</p>
      <p className="mt-3 text-stone-600">{r.calendarPreview}</p>
    </section>
    <ContactForm content={content} preview />
  </div>;
  if (failed) return <Notice ok={false}>{r.timezoneDetectionError}</Notice>;
  if (!timezone) return <p role="status">{r.loadingCalendar}</p>;
  if (selected) return <ContactForm content={content} startsAt={selected} timezone={timezone}
    onBack={() => setSelected(null)} />;

  return <section className="space-y-5">
    <h3 className="text-2xl font-bold">{r.chooseTrial}</h3>
    <p>{r.publicTrialInfo}</p>
    <p className="text-stone-600">{t.common.timezoneNote(timezone)}</p>
    {days.length === 0 ? <Notice ok={false}>{r.noTrialSlots}</Notice> : <>
      <h4 className="text-xl font-semibold">{t.dashboard.booking.chooseDay}</h4>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {days.map((key) => <button key={key} type="button" onClick={() => setDay(key)} aria-pressed={key === activeDay}
          className={buttonClass(key === activeDay ? "primary" : "secondary", "lg", "shrink-0")}>
          {formatDayKey(key, { weekday: "short", day: "numeric", month: "short" })}
        </button>)}
      </div>
      <h4 className="text-xl font-semibold">{t.dashboard.booking.chooseTime}</h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(byDay[activeDay] ?? []).map((slot) => <button type="button" key={slot.startsAt}
          className={buttonClass("success", "lg")} onClick={() => setSelected(slot.startsAt)}>
          {formatTime(slot.startsAt, timezone)}
        </button>)}
      </div>
      <p className="text-sm text-stone-600">{r.slotNotHeld}</p>
    </>}
  </section>;
}
