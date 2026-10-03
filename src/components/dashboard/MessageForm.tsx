"use client";

import { useActionState } from "react";
import { sendMessageToTeacher } from "@/app/dashboard/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { t } from "@/lib/i18n";
import type { ActionResult } from "@/lib/types";

export function MessageForm() {
  const c = t.dashboard.contact;
  const [state, action] = useActionState<ActionResult | null, FormData>(sendMessageToTeacher, null);

  if (state?.ok) return <Notice ok>{state.message}</Notice>;

  return (
    <form action={action} className="space-y-4">
      <label htmlFor="message" className="label">{c.message}</label>
      <textarea id="message" name="message" rows={6} required maxLength={4000} className="input" />
      {state && <Notice ok={false}>{state.message}</Notice>}
      <SubmitButton pendingText={c.sending} size="xl">
        ✉️ {c.send}
      </SubmitButton>
    </form>
  );
}
