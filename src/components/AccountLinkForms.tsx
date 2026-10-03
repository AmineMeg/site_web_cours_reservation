"use client";

import { useActionState } from "react";
import { confirmAccountLink, requestPasswordReset, setAccountPassword } from "@/app/auth/actions";
import { Notice } from "@/components/ui/Notice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { accountText as a } from "@/lib/i18n/account";
import { t } from "@/lib/i18n";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { Turnstile } from "@/components/Turnstile";
import type { ActionResult } from "@/lib/types";

export function ConfirmAccountForm({ tokenHash, type }: { tokenHash: string; type: string }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(confirmAccountLink, null);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
      <SubmitButton pendingText={a.sending} size="xl" className="w-full">{a.continue}</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState<ActionResult | null, FormData>(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-5">
      <label htmlFor="reset-email" className="label">{t.common.email}</label>
      <input id="reset-email" name="email" type="email" autoComplete="email" required maxLength={254} className="input" />
      <Turnstile action="reset" />
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
      <SubmitButton pendingText={a.sending} size="xl" className="w-full">{a.sendLink}</SubmitButton>
    </form>
  );
}

export function SetPasswordForm() {
  const [state, action] = useActionState<ActionResult | null, FormData>(setAccountPassword, null);
  return (
    <form action={action} className="space-y-5">
      <label htmlFor="new-password" className="label">{a.newPassword}</label>
      <input id="new-password" name="password" type="password" autoComplete="new-password" required
        minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} className="input" />
      <label htmlFor="confirm-password" className="label">{a.confirmPassword}</label>
      <input id="confirm-password" name="confirm" type="password" autoComplete="new-password" required
        minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} className="input" />
      {state && <Notice ok={state.ok}>{state.message}</Notice>}
      <SubmitButton pendingText={a.sending} size="xl" className="w-full">{a.passwordSave}</SubmitButton>
    </form>
  );
}
