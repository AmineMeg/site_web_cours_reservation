import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile, getSettings, requireMfa } from "@/lib/auth";
import { buttonClass } from "@/components/ui/button";
import { RegenerateCodes } from "@/components/security/RegenerateCodes";
import { SessionControls } from "@/components/security/SessionControls";
import { SecurityPasswordForm } from "@/components/SecurityPasswordForm";
import { securityText as s } from "@/lib/i18n/security";
import { t } from "@/lib/i18n";

export default async function SecuritySettingsPage() {
  const { supabase, user, status } = await requireMfa();
  const { profile } = await getCurrentProfile();
  if (!profile) redirect("/security");

  const [settings, remaining, activity] = await Promise.all([
    getSettings(supabase),
    supabase.rpc("security_recovery_codes_remaining"),
    supabase
      .from("security_audit_log")
      .select("id, event, occurred_at")
      .eq("subject_id", user.id)
      .order("occurred_at", { ascending: false })
      .limit(10),
  ]);

  const format = new Intl.DateTimeFormat(t.locale, { dateStyle: "medium", timeStyle: "short", timeZone: settings.timezone });
  const codesLeft = typeof remaining.data === "number" ? remaining.data : null;
  const events = (activity.data ?? []) as { id: number; event: string; occurred_at: string }[];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{s.settingsTitle}</h1>
        <Link href={profile.role === "teacher" ? "/admin" : "/dashboard"} className="font-semibold text-brand-700 underline">
          {s.backToApp}
        </Link>
      </div>
      <p className="text-lg text-stone-600">{status.requiresMfa ? s.settingsIntro : s.studentSettingsIntro}</p>

      {status.requiresMfa && <>
      <section className="space-y-3">
        <h2 className="text-2xl font-bold">{s.factorTitle}</h2>
        <p className="text-lg">{s.factorOn}</p>
        <Link href="/security/setup?replace=1" className={buttonClass("secondary", "md")}>{s.replaceFactor}</Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">{s.codesSectionTitle}</h2>
        {codesLeft !== null && <p className="text-lg">{s.codesRemaining(codesLeft)}</p>}
        {codesLeft !== null && codesLeft <= 3 && <p className="font-semibold text-red-700">{s.codesLow}</p>}
        <RegenerateCodes />
      </section>
      </>}

      <SecurityPasswordForm />

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">{s.sessionTitle}</h2>
        <p className="text-stone-600">{s.sessionLimits}</p>
        {status.absoluteExpiresAt && (
          <p className="text-stone-600">{s.sessionEndsAt(format.format(new Date(status.absoluteExpiresAt)))}</p>
        )}
        <SessionControls />
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-bold">{s.activityTitle}</h2>
        {events.length === 0 ? (
          <p className="text-stone-600">{s.noActivity}</p>
        ) : (
          <ul className="divide-y divide-stone-200">
            {events.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{s.events[entry.event] ?? entry.event}</span>
                <time dateTime={entry.occurred_at} className="text-stone-500">{format.format(new Date(entry.occurred_at))}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}