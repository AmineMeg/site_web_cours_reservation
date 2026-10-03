"use client";

import { useActionState } from "react";
import { submitContact, type ContactFormState } from "@/app/actions/contact";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { t } from "@/lib/i18n";
import type { HomepageContent } from "@/lib/website-content";
import { HomepageText } from "./HomepageText";
import { buttonClass } from "@/components/ui/button";
import { LocationFields } from "@/components/LocationFields";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { formatDateTime } from "@/lib/dates";
import Link from "next/link";

const initialState: ContactFormState = { status: "idle", message: "" };

export function ContactForm({ content, preview = false, startsAt, timezone, onBack }: {
  content?: HomepageContent; preview?: boolean; startsAt?: string; timezone?: string; onBack?: () => void;
}) {
  const [state, formAction, pending] = useActionState(submitContact, initialState);
  const c = {
    ...t.landing.contact,
    ...(content ? {
      name: content.contactName, email: content.contactEmail, phone: content.contactPhone,
      message: content.contactMessage, messagePlaceholder: content.contactPlaceholder,
      submit: content.contactSubmit,
    } : {}),
  };

  if (state.status === "success") {
    return <div className="space-y-4">
      <Notice ok>{state.message}</Notice>
      {state.booking && <p className="text-xl font-semibold">{formatDateTime(state.booking.startsAt, state.booking.timezone)}</p>}
      {state.trialUrl && <Link href={state.trialUrl} className={buttonClass("secondary", "lg", "w-full")}>{r.manageTrial}</Link>}
    </div>;
  }

  const err = state.errors ?? {};

  if (preview) return <div className="space-y-5">
    <p className="text-stone-700">{r.publicTrialInfo}</p>
    <div><p className="label"><HomepageText field="contactName">{c.name}</HomepageText> *</p><div className="input min-h-14" aria-hidden /></div>
    <div className="grid gap-5 sm:grid-cols-2">
      <div><p className="label"><HomepageText field="contactEmail">{c.email}</HomepageText> *</p><div className="input min-h-14" aria-hidden /></div>
      <div><p className="label"><HomepageText field="contactPhone">{c.phone}</HomepageText></p><div className="input min-h-14" aria-hidden /></div>
    </div>
    <div><p className="label"><HomepageText field="contactMessage">{c.message}</HomepageText></p>
      <div className="input min-h-32 text-stone-500"><HomepageText field="contactPlaceholder">{c.messagePlaceholder}</HomepageText></div>
    </div>
    <LocationFields preview />
    <div className={buttonClass("primary", "xl", "w-full")}><HomepageText field="contactSubmit">{c.submit}</HomepageText></div>
  </div>;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <fieldset disabled={pending} className="space-y-5">
      {startsAt && timezone && <div className="rounded-xl bg-emerald-50 p-4">
        <p className="font-semibold">{r.trialLabel}</p>
        <p className="text-xl">{formatDateTime(startsAt, timezone)}</p>
        {onBack && <button type="button" onClick={onBack} className="mt-3 text-brand-700 underline">{r.changeTrialSlot}</button>}
      </div>}
      <input type="hidden" name="startsAt" value={startsAt ?? ""} />
      <p className="text-lg text-stone-700">{r.completeTrialForm}</p>
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
      <LocationFields />
      {err.location && <p className="text-red-700">{err.location}</p>}
      {/* Honeypot field, hidden from humans */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="company">{t.landing.contact.company}</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      {state.status === "error" && (!state.errors || err.slot) && <Notice ok={false}>{state.message}</Notice>}
      <SubmitButton pendingText={c.sending} size="xl" className="w-full">
        {c.submit}
      </SubmitButton>
      </fieldset>
    </form>
  );
}
