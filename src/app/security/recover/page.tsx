import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth";
import { RecoverForm } from "@/components/security/RecoverForm";
import { securityText as s } from "@/lib/i18n/security";

export default async function SecurityRecoverPage() {
  const { status } = await requireAuthenticatedUser();
  if (!status.requiresMfa) redirect("/security/settings");
  if (!status.hasVerifiedFactor) redirect("/security/setup");
  if (status.aal === "aal2") redirect("/security/settings");
  return (
    <>
      <h1 className="text-3xl font-bold">{s.recoverTitle}</h1>
      <p className="text-lg text-stone-600">{s.recoverIntro}</p>
      <RecoverForm />
      <p className="text-stone-600">{s.recoverNoCodes}</p>
      <Link href="/security/verify" className="inline-block font-semibold text-brand-700 underline">{s.backToCode}</Link>
    </>
  );
}