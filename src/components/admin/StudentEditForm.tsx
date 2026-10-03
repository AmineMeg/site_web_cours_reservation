"use client";

import { useActionState, useState, useTransition } from "react";
import { resetStudentPassword, updateStudent } from "@/app/admin/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/Notice";
import { t } from "@/lib/i18n";
import type { ActionResult, Profile } from "@/lib/types";

export function StudentEditForm({ student }: { student: Profile }) {
  const d = t.admin.studentDetail;
  const [state, action] = useActionState<ActionResult | null, FormData>(updateStudent, null);
  const [resetResult, setResetResult] = useState<ActionResult | null>(null);
  const [resetting, startReset] = useTransition();

  const reset = () => {
    if (!window.confirm(d.resetPasswordConfirm)) return;
    startReset(async () => setResetResult(await resetStudentPassword(student.id)));
  };

  return (
    <div className="space-y-6">
      <form action={action} className="card space-y-5">
        <h2 className="text-2xl font-bold">{d.editTitle}</h2>
        <input type="hidden" name="id" value={student.id} />
        <div>
          <label htmlFor="full_name" className="label">{d.fullName}</label>
          <input id="full_name" name="full_name" defaultValue={student.full_name} maxLength={120} className="input" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className="label">{d.email}</label>
            <input id="email" name="email" type="email" defaultValue={student.email} required className="input" />
          </div>
          <div>
            <label htmlFor="phone" className="label">{d.phone}</label>
            <input id="phone" name="phone" type="tel" defaultValue={student.phone} maxLength={40} className="input" />
          </div>
        </div>
        <div>
          <label htmlFor="objectives" className="label">{d.objectives}</label>
          <textarea id="objectives" name="objectives" rows={4} defaultValue={student.objectives} maxLength={4000} className="input" />
        </div>
        <div>
          <label htmlFor="teacher_notes" className="label">🔒 {d.notes}</label>
          <textarea id="teacher_notes" name="teacher_notes" rows={4} defaultValue={student.teacher_notes} maxLength={4000} className="input" />
        </div>
        <label className="flex cursor-pointer items-center gap-4 rounded-xl bg-stone-50 p-4 text-lg font-semibold">
          <input type="checkbox" name="is_active" defaultChecked={student.is_active} className="h-7 w-7 accent-emerald-600" />
          {d.active}
        </label>
        {state && <Notice ok={state.ok}>{state.message}</Notice>}
        <SubmitButton pendingText={t.common.saving} size="xl" className="w-full sm:w-auto">
          💾 {t.common.save}
        </SubmitButton>
      </form>

      <div className="card space-y-3">
        <button type="button" onClick={reset} disabled={resetting} className={buttonClass("secondary", "lg")}>
          🔑 {d.resetPassword}
        </button>
        {resetResult && <Notice ok={resetResult.ok}>{resetResult.message}</Notice>}
      </div>
    </div>
  );
}
