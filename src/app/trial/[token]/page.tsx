import type { Metadata } from "next";
import Link from "next/link";
import { getTrialContext } from "@/lib/trial";
import { TrialCalendar } from "@/components/TrialCalendar";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { t } from "@/lib/i18n";
import { Notice } from "@/components/ui/Notice";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: r.trialTitle, robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function TrialPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data, error } = await getTrialContext(token);
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-12">
    <Link href="/" className="text-brand-700 underline">{t.common.home}</Link>
    <h1 className="text-3xl font-bold">{r.trialTitle}</h1>
    <p className="text-lg">{r.online}</p>
    {!data ? <Notice ok={false}>{error === "LINK_EXPIRED" ? r.expired : t.common.error}</Notice>
      : <><p className="text-lg">{data.contact.name} · {r.trialLabel}</p>
        <p className="text-stone-600">{r.linkUntil} {formatExpiry(data.expires_at, data.contact.timezone)}.</p>
        <TrialCalendar token={token} timezone={data.contact.timezone} slots={data.slots} booking={data.booking} /></>}
  </main>;
}

function formatExpiry(date: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: timezone }).format(new Date(date));
}
