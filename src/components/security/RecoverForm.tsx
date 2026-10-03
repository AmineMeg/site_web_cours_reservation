"use client";

import { useActionState } from "react";
import { recoverWithCode, type CodeFormState } from "@/app/security/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { securityText as s } from "@/lib/i18n/security";

export function RecoverForm() {
  const [state, action] = useActionState<CodeFormState, FormData>(recoverWithCode, { message: "" });
  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="recover-password" className="label">{s.passwordLabel}</label>
        <input id="recover-password" name="password" type="password" required autoComplete="current-password" className="input" />
      </div>
      <div>
        <label htmlFor="recover-code" className="label">{s.recoveryCodeLabel}</label>
        <input
          id="recover-code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={64}
          className="input font-mono"
        />
      </div>
      {state.message && <Notice ok={false}>{state.message}</Notice>}
      <SubmitButton pendingText={s.recovering} variant="danger" size="xl" className="w-full">
        {s.recoverButton}
      </SubmitButton>
    </form>
  );
}