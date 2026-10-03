import Link from "next/link";
import { requireMfa } from "@/lib/auth";
import { safeNextPath } from "@/lib/security/redirects";
import { TotpCodeForm } from "@/components/security/TotpCodeForm";
import { securityText as s } from "@/lib/i18n/security";

export default async function SecurityReauthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next) ?? "/security/settings";
  await requireMfa();
  return (
    <>
      <h1 className="text-3xl font-bold">{s.reauthTitle}</h1>
      <p className="text-lg text-stone-600">{s.reauthIntro}</p>
      <TotpCodeForm mode="reauth" next={next} />
      <Link href={next} className="inline-block font-semibold text-stone-600 underline">{s.back}</Link>
    </>
  );
}