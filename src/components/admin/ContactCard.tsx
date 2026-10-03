"use client";

import { useEffect, useState, useTransition } from "react";
import { createStudentFromContact, deleteContact, resendTrialLink, declineContact } from "@/app/admin/actions";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/Notice";
import { t } from "@/lib/i18n";
import type { ActionResult, Contact, TrialBooking } from "@/lib/types";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { formatDateTime } from "@/lib/dates";

export function ContactCard({
  contact,
  receivedLabel,
  daysLeft,
  trial, timezone, now, hasTrialHistory,
}: {
  contact: Contact;
  receivedLabel: string;
  daysLeft: number;
  trial: TrialBooking | null;
  timezone: string;
  now: number;
  hasTrialHistory: boolean;
}) {
  const c = t.admin.contacts;
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [clock, setClock] = useState(now);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const canConvert = !!trial && Date.parse(trial.starts_at) <= clock && !contact.trial_declined_at;

  const convert = () =>
    startTransition(async () => {
      setResult(await createStudentFromContact(contact.id));
    });

  const remove = () => {
    if (!window.confirm(c.removeConfirm(contact.name))) return;
    startTransition(async () => {
      setResult(await deleteContact(contact.id));
    });
  };

  return (
    <li className="card">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="text-2xl font-bold">{contact.name}</h2>
          <p className="text-stone-500">{c.received(receivedLabel)}</p>
          <p className="text-lg">
            📧{" "}
            <a href={`mailto:${contact.email}`} className="break-all font-medium text-brand-700 underline">
              {contact.email}
            </a>
          </p>
          {contact.phone && (
            <p className="text-lg">
              📞{" "}
              <a href={`tel:${contact.phone}`} className="font-medium text-brand-700 underline">
                {contact.phone}
              </a>
            </p>
          )}
          <blockquote className="mt-3 whitespace-pre-line rounded-xl bg-stone-50 p-4 text-lg text-stone-700">
            {contact.message || c.noMessage}
          </blockquote>
          <p className="text-stone-600">{contact.city}, {contact.country} · {contact.timezone}</p>
          <p className="text-lg font-semibold">{contact.trial_declined_at ? r.declined : trial
            ? `${r.trialLabel} · ${formatDateTime(trial.starts_at, timezone)}` : r.waiting}</p>
          <p className="text-sm text-stone-500">{hasTrialHistory ? r.retained : c.autoDelete(daysLeft)}</p>
        </div>

        <div className="flex shrink-0 flex-col gap-3 lg:w-72">
          <p>{contact.trial_declined_at ? r.declined : canConvert ? r.ready : r.waitingStart}</p>
          <button type="button" onClick={convert} disabled={pending || !canConvert} className={buttonClass("success", "xl", "w-full")}>
            {pending ? c.creating : `✅ ${c.createAccount}`}
          </button>
          {!contact.trial_declined_at && <button type="button" disabled={pending}
            onClick={() => startTransition(async () => setResult(await resendTrialLink(contact.id)))}
            className={buttonClass("secondary", "lg", "w-full")}>{r.resend}</button>}
          {canConvert && <button type="button" disabled={pending} onClick={() => {
            if (window.confirm(r.declineConfirm)) startTransition(async () => setResult(await declineContact(contact.id)));
          }} className={buttonClass("danger", "lg", "w-full")}>{r.decline}</button>}
          {!hasTrialHistory && <button type="button" onClick={remove} disabled={pending} className={buttonClass("ghost", "md", "w-full")}>
            🗑️ {c.remove}
          </button>}
        </div>
      </div>
      {result && (
        <div className="mt-4">
          <Notice ok={result.ok}>{result.message}</Notice>
        </div>
      )}
    </li>
  );
}
