"use client";

import { useActionState } from "react";
import { changeAccountPassword } from "@/app/auth/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { accountText as a } from "@/lib/i18n/account";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import type { ActionResult } from "@/lib/types";

export function SecurityPasswordForm() {
  const [state, action] = useActionState<ActionResult | null, FormData>(changeAccountPassword, null);
  return (
    <form action={action} className="card space-y-5">
      <h2 className="text-2xl font-bold">{a.setTitle}</h2>
      <p className="text-stone-600">{a.setIntro}</p>
      <div>
        <label htmlFor="current-password" className="label">{a.currentPassword}</label>
        <input id="current-password" name="current_password" type="password" required autoComplete="current-password" className="input" />
      </div>
      <div>
        <label htmlFor="change-password" className="label">{a.newPassword}</label>
        <input id="change-password" name="password" type="password" required autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} className="input" />
      </div>
      <div>
        <label htmlFor="change-confirm" className="label">{a.confirmPassword}</label>
        <input id="change-confirm" name="confirm" type="password" required autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} className="input" />
      </div>
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
      <SubmitButton pendingText={a.sending} size="lg">{a.passwordSave}</SubmitButton>
    </form>
  );
}
