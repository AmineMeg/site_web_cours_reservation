"use client";

import { useActionState } from "react";
import { verifyTotpCode, type CodeFormState } from "@/app/security/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { securityText as s } from "@/lib/i18n/security";

export function TotpCodeForm({ mode, next }: { mode: "verify" | "reauth"; next?: string | null }) {
  const [state, action] = useActionState<CodeFormState, FormData>(verifyTotpCode, { message: "" });
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="mode" value={mode} />
      {next && <input type="hidden" name="next" value={next} />}
      <div>
        <label htmlFor="totp-code" className="label">{s.codeLabel}</label>
        <input
          id="totp-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoFocus
          className="input text-center font-mono text-2xl tracking-widest"
        />
      </div>
      {state.message && <Notice ok={false}>{state.message}</Notice>}
      <SubmitButton pendingText={s.verifying} size="xl" className="w-full">
        {s.verifyButton}
      </SubmitButton>
    </form>
  );
}