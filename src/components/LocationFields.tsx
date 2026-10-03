"use client";

import { useEffect, useState } from "react";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { browserTimezone } from "@/lib/timezones";
import { Notice } from "@/components/ui/Notice";

export function LocationFields({ initial, preview = false, detectTimezone = true }: {
  initial?: { country: string; city: string; timezone: string };
  preview?: boolean;
  detectTimezone?: boolean;
}) {
  const [timezone, setTimezone] = useState(detectTimezone ? "" : initial?.timezone ?? "");
  const [detectionFailed, setDetectionFailed] = useState(false);
  const [zones, setZones] = useState<string[]>(initial?.timezone ? [initial.timezone] : []);
  useEffect(() => {
    if (preview) return;
    if (detectTimezone) {
      try {
        setTimezone(browserTimezone());
        setDetectionFailed(false);
      } catch {
        setTimezone("");
        setDetectionFailed(true);
      }
      return;
    }
    const chosen = initial?.timezone ?? "";
    setZones(Array.from(new Set([...Intl.supportedValuesOf("timeZone"), ...(chosen ? [chosen] : [])])).sort());
    setTimezone(chosen);
  }, [initial?.timezone, preview, detectTimezone]);
  if (preview) return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      {[r.country, r.city].map((label) => <div key={label}><p className="label">{label} *</p><div className="input min-h-14" aria-hidden>{label === r.country ? "Brasil" : ""}</div></div>)}
    </div>
    <p className="text-sm text-stone-600">{r.timezoneAutomatic}</p>
  </div>;
  return <fieldset disabled={preview} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="label">{r.country} *
        <input name="country" required maxLength={100} defaultValue={initial?.country || "Brasil"} autoComplete="country-name" className="input mt-2" />
      </label>
      <label className="label">{r.city} *
        <input name="city" required maxLength={100} defaultValue={initial?.city} autoComplete="address-level2" className="input mt-2" />
      </label>
    </div>
    {detectTimezone ? <>
      <input type="hidden" name="timezone" value={timezone} />
      <p className="text-sm text-stone-600">{r.timezoneAutomatic}</p>
      {detectionFailed && <Notice ok={false}>{r.timezoneDetectionError}</Notice>}
    </> : <>
    <label className="label">{r.timezone} *
      <select name="timezone" required value={timezone} onChange={(event) => setTimezone(event.target.value)} className="input mt-2">
        <option value="">—</option>
        {zones.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>)}
      </select>
    </label>
    <p className="text-sm text-stone-600">{r.timezoneHelp}</p>
    </>}
  </fieldset>;
}
