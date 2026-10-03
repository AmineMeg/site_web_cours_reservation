import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/security/redirects";
import { TotpCodeForm } from "@/components/security/TotpCodeForm";
import { SignOutButton } from "@/components/security/SignOutButton";
import { securityText as s } from "@/lib/i18n/security";

export default async function SecurityVerifyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const nextValue = next === "password" ? "password" : safeNextPath(next);
  const { status } = await requireAuthenticatedUser();
  if (!status.requiresMfa) redirect(nextValue ? `/security?next=${encodeURIComponent(nextValue)}` : "/security");
  if (!status.hasVerifiedFactor) redirect("/security/setup");
  if (status.aal === "aal2") redirect(nextValue ? `/security?next=${encodeURIComponent(nextValue)}` : "/security");
  return (
    <>
      <h1 className="text-3xl font-bold">{s.verifyTitle}</h1>
      <p className="text-lg text-stone-600">{s.verifyIntro}</p>
      <TotpCodeForm mode="verify" next={nextValue} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/security/recover" className="font-semibold text-brand-700 underline">{s.lostDevice}</Link>
        <SignOutButton />
      </div>
    </>
  );
}