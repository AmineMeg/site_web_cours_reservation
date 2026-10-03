"use client";

import { useState, useTransition } from "react";
import { saveCreditValidity } from "@/app/admin/actions";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { t } from "@/lib/i18n";
import { Notice } from "@/components/ui/Notice";
import { buttonClass } from "@/components/ui/button";
import type { ActionResult } from "@/lib/types";

export function CreditValiditySettings({ initial }: { initial: number }) {
  const [months, setMonths] = useState(initial);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return <section className="card mb-6 space-y-4">
    <label className="label">{r.validitySetting}
      <input type="number" min={1} max={120} step={1} value={months} onChange={(event) => setMonths(Number(event.target.value))}
        className="input mt-2 max-w-40" />
    </label>
    <p>{r.validityHelp}</p>
    <button type="button" disabled={pending} onClick={() => startTransition(async () => setResult(await saveCreditValidity(months)))}
      className={buttonClass("primary", "lg")}>{pending ? t.common.saving : t.common.save}</button>
    {result && <Notice ok={result.ok}>{result.message}</Notice>}
  </section>;
}
