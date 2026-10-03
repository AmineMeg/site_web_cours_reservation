"use client";

import { useActionState } from "react";
import { changePassword, updateMyProfile } from "@/app/dashboard/actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Notice } from "@/components/ui/Notice";
import { t } from "@/lib/i18n";
import type { ActionResult, Profile } from "@/lib/types";

export function ProfileForm({ profile }: { profile: Pick<Profile, "full_name" | "email" | "phone" | "objectives"> }) {
  const p = t.dashboard.profile;
  const [state, action] = useActionState<ActionResult | null, FormData>(updateMyProfile, null);
  const [pwState, pwAction] = useActionState<ActionResult | null, FormData>(changePassword, null);

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

      <form action={pwAction} className="card space-y-5">
        <h2 className="text-2xl font-bold">🔑 {p.passwordTitle}</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="password" className="label">{p.newPassword}</label>
            <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="input" />
          </div>
          <div>
            <label htmlFor="confirm" className="label">{p.confirmPassword}</label>
            <input id="confirm" name="confirm" type="password" minLength={8} required autoComplete="new-password" className="input" />
          </div>
        </div>
        {pwState && <Notice ok={pwState.ok}>{pwState.message}</Notice>}
        <SubmitButton pendingText={t.common.saving} variant="secondary">
          {p.passwordSave}
        </SubmitButton>
      </form>
    </div>
  );
}
