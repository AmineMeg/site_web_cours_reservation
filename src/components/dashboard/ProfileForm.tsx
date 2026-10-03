"use client";

import { useActionState } from "react";
import { updateMyProfile } from "@/app/dashboard/actions";
import { SecurityPasswordForm } from "@/components/SecurityPasswordForm";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { t } from "@/lib/i18n";
import type { ActionResult, Profile } from "@/lib/types";
import { LocationFields } from "@/components/LocationFields";

export function ProfileForm({ profile }: { profile: Pick<Profile, "full_name" | "email" | "phone" | "objectives" | "country" | "timezone"> }) {
  const p = t.dashboard.profile;
  const [state, action] = useActionState<ActionResult | null, FormData>(updateMyProfile, null);

  return (
    <div className="space-y-8">
      <form action={action} className="card space-y-5">
        <h1 className="text-3xl font-bold">{p.title}</h1>
        <div>
          <label htmlFor="full_name" className="label">{p.fullName}</label>
          <input id="full_name" name="full_name" defaultValue={profile.full_name} maxLength={120} className="input" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className="label">{p.email}</label>
            <input id="email" value={profile.email} readOnly disabled className="input bg-stone-100 text-stone-500" />
          </div>
          <div>
            <label htmlFor="phone" className="label">{p.phone}</label>
            <input id="phone" name="phone" type="tel" defaultValue={profile.phone} maxLength={40} className="input" />
          </div>
        </div>
        <LocationFields initial={profile} />
        <div>
          <label htmlFor="objectives" className="label">🎯 {p.objectives}</label>
          <p className="mb-2 text-stone-600">{p.objectivesHelp}</p>
          <textarea id="objectives" name="objectives" rows={6} defaultValue={profile.objectives} maxLength={4000} className="input" />
        </div>
        {state && <Notice ok={state.ok}>{state.message}</Notice>}
        <SubmitButton pendingText={t.common.saving} size="xl">
          💾 {t.common.save}
        </SubmitButton>
      </form>

      <SecurityPasswordForm />
    </div>
  );
}
