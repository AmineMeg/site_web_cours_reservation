"use client";

import { useActionState } from "react";
import { setMyAdminMfa } from "@/app/security/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { securityText as s } from "@/lib/i18n/security";
import type { ActionResult } from "@/lib/types";

export function AdminMfaSetting({ enabled }: { enabled: boolean }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(setMyAdminMfa, null);
  return <form action={action} className="card space-y-4">
    <h2 className="text-2xl font-bold">{s.adminMfaTitle}</h2>
    <p className="text-stone-600">{s.adminMfaHelp}</p>
    <p className="text-lg font-semibold">{enabled ? s.factorOn : s.adminMfaOff}</p>
    {!enabled && <Notice ok={false}>{s.adminMfaWarning}</Notice>}
    <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
    <label className="label">{s.passwordLabel}
      <input name="current_password" type="password" required autoComplete="current-password" className="input mt-2" disabled={pending} />
    </label>
    {result && <Notice ok={result.ok}>{result.message}</Notice>}
    <SubmitButton pendingText={s.verifying} size="lg">{enabled ? s.adminMfaDisable : s.adminMfaEnable}</SubmitButton>
  </form>;
}
