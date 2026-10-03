"use client";

import { useActionState } from "react";
import { submitContact, type ContactFormState } from "@/app/actions/contact";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { t } from "@/lib/i18n";
import type { HomepageContent } from "@/lib/website-content";

const initialState: ContactFormState = { status: "idle", message: "" };

export function ContactForm({ content, preview = false }: { content?: HomepageContent; preview?: boolean }) {
  const [state, formAction] = useActionState(submitContact, initialState);
  const c = {
    ...t.landing.contact,
    ...(content ? {
      name: content.contactName, email: content.contactEmail, phone: content.contactPhone,
      message: content.contactMessage, messagePlaceholder: content.contactPlaceholder,
      submit: content.contactSubmit,
    } : {}),
  };

  if (state.status === "success") {
    return <Notice ok>{state.message}</Notice>;
  }

  const err = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <fieldset disabled={preview} className="space-y-5">
      <div>
        <label htmlFor="name" className="label">
          {c.name} *
        </label>
        <input id="name" name="name" required maxLength={120} autoComplete="name" className="input" aria-invalid={!!err.name} />
        {err.name && <p className="mt-1 text-red-700">{err.name}</p>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="label">
            {c.email} *
          </label>
          <input id="email" name="email" type="email" required maxLength={254} autoComplete="email" className="input" aria-invalid={!!err.email} />
          {err.email && <p className="mt-1 text-red-700">{err.email}</p>}
        </div>
        <div>
          <label htmlFor="phone" className="label">
            {c.phone}
          </label>
          <input id="phone" name="phone" type="tel" maxLength={40} autoComplete="tel" className="input" />
          {err.phone && <p className="mt-1 text-red-700">{err.phone}</p>}
        </div>
      </div>
      <div>
        <label htmlFor="message" className="label">
          {c.message}
        </label>
        <textarea id="message" name="message" rows={4} maxLength={2000} placeholder={c.messagePlaceholder} className="input" />
        {err.message && <p className="mt-1 text-red-700">{err.message}</p>}
      </div>
      {/* Honeypot field, hidden from humans */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      {state.status === "error" && !state.errors && <Notice ok={false}>{state.message}</Notice>}
      <SubmitButton pendingText={c.sending} size="xl" className="w-full">
        {c.submit}
      </SubmitButton>
      </fieldset>
    </form>
  );
}
