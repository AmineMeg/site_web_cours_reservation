"use client";

import { useEffect, useState } from "react";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { validTimezone } from "@/lib/timezones";

export function LocationFields({ initial, preview = false }: {
  initial?: { country: string; city: string; timezone: string };
  preview?: boolean;
}) {
  const [timezone, setTimezone] = useState(initial?.timezone ?? "");
  const [zones, setZones] = useState<string[]>(initial?.timezone ? [initial.timezone] : []);
  useEffect(() => {
    if (preview) return;
    const list = Intl.supportedValuesOf("timeZone");
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const chosen = initial?.timezone || (validTimezone(detected) ? detected : "");
    setZones(Array.from(new Set([...list, ...(chosen ? [chosen] : [])])).sort());
    setTimezone(chosen);
  }, [initial?.timezone, preview]);
  if (preview) return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      {[r.country, r.city].map((label) => <div key={label}><p className="label">{label} *</p><div className="input min-h-14" aria-hidden /></div>)}
    </div>
    <div><p className="label">{r.timezone} *</p><div className="input min-h-14" aria-hidden /></div>
    <p className="text-sm text-stone-600">{r.timezoneHelp}</p>
  </div>;
  return <fieldset disabled={preview} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label">{r.country} *
        <input name="country" required maxLength={100} defaultValue={initial?.country} autoComplete="country-name" className="input mt-2" />
      </label>
      <label className="label">{r.city} *
        <input name="city" required maxLength={100} defaultValue={initial?.city} autoComplete="address-level2" className="input mt-2" />
      </label>
    </div>
    <label className="label">{r.timezone} *
      <select name="timezone" required value={timezone} onChange={(event) => setTimezone(event.target.value)} className="input mt-2">
        <option value="">—</option>
        {zones.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>)}
      </select>
    </label>
    <p className="text-sm text-stone-600">{r.timezoneHelp}</p>
  </fieldset>;
}
