"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { t } from "@/lib/i18n";
import { Turnstile } from "@/components/Turnstile";

export function LoginForm() {
  const [state, action] = useActionState<LoginState, FormData>(signIn, { message: "" });
  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="email" className="label">
          {t.login.email}
        </label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input" />
      </div>
      <div>
        <label htmlFor="password" className="label">
          {t.login.password}
        </label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
      </div>
      <Turnstile action="login" />
      {state.message && <Notice ok={false}>{state.message}</Notice>}
      <SubmitButton pendingText={t.login.submitting} size="xl" className="w-full">
        {t.login.submit}
      </SubmitButton>
    </form>
  );
}
