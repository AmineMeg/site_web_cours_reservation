"use client";

import { useEffect, useState, useTransition } from "react";
import { adjustCredits } from "@/app/admin/actions";
import { t } from "@/lib/i18n";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";

/** Big "− [amount] +" control for prepaid lesson credits. */
export function CreditControl({ studentId, initialCredits, validityMonths }: { studentId: string; initialCredits: number; validityMonths: number }) {
  const c = t.admin.credits;
  const [credits, setCredits] = useState(initialCredits);
  const [amount, setAmount] = useState(1);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => setCredits(initialCredits), [initialCredits]);

  const change = (sign: 1 | -1) =>
    startTransition(async () => {
      const result = await adjustCredits(studentId, sign * amount);
      if (result.ok && result.credits !== undefined) setCredits(result.credits);
      setFeedback(result);
    });

  return (
    <div className="rounded-2xl bg-accent-50 p-4">
      <p className="text-base font-semibold text-stone-700">{c.label}</p>
      <p className="my-2 text-sm text-stone-600">{r.validity(validityMonths)}</p>
      <p className="text-4xl font-extrabold text-stone-900" aria-live="polite">
        {credits}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => change(-1)}
          disabled={pending || credits === 0}
          aria-label={`${c.remove} ${amount}`}
          className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-3xl font-bold text-red-700 shadow-sm ring-2 ring-red-200 hover:bg-red-50 disabled:opacity-40"
        >
          −
        </button>
        <label className="sr-only" htmlFor={`amount-${studentId}`}>
          {c.amount}
        </label>
        <input
          id={`amount-${studentId}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={amount}
          onChange={(e) => setAmount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
          className="h-14 w-20 rounded-xl border-2 border-stone-300 text-center text-2xl font-bold"
        />
        <button
          type="button"
          onClick={() => change(1)}
          disabled={pending}
          aria-label={`${c.add} ${amount}`}
          className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-600 text-3xl font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40"
        >
          +
        </button>
      </div>
      {feedback && (
        <p className={`mt-2 text-sm font-medium ${feedback.ok ? "text-emerald-800" : "text-red-700"}`} role="status">
          {feedback.message}
        </p>
      )}
    </div>
  );
}
