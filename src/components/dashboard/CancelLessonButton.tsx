"use client";

import { useState, useTransition } from "react";
import { cancelMyLesson } from "@/app/dashboard/actions";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { Notice } from "@/components/ui/Notice";
import { buttonClass } from "@/components/ui/button";
import type { ActionResult } from "@/lib/types";

export function CancelLessonButton({ id, allowed }: { id: string; allowed: boolean }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return <div className="mt-3 space-y-2">
    <button type="button" disabled={pending || !allowed} className={buttonClass("danger", "md")}
      onClick={() => {
        if (window.confirm(`${r.cancelConfirm}\n${r.refund}`)) startTransition(async () => setResult(await cancelMyLesson(id)));
      }}>{r.cancel}</button>
    {!allowed && <p className="text-sm font-normal">{r.tooLate}</p>}
    {result && <Notice ok={result.ok}>{result.message}</Notice>}
  </div>;
}
