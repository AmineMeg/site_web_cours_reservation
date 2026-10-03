import { redirect } from "next/navigation";
import { requireAuthenticatedUser, requireRecentAuthentication } from "@/lib/auth";
import { MfaSetupWizard } from "@/components/security/MfaSetupWizard";
import { SignOutButton } from "@/components/security/SignOutButton";
import { securityText as s } from "@/lib/i18n/security";

export default async function SecuritySetupPage({ searchParams }: { searchParams: Promise<{ replace?: string }> }) {
  const replace = (await searchParams).replace === "1";
  const context = await requireAuthenticatedUser();
  if (!context.status.requiresMfa) redirect("/security/settings");
  if (replace) {
    await requireRecentAuthentication({ next: "/security/setup?replace=1" });
  } else {
    const { status } = await requireAuthenticatedUser();
    if (status.hasVerifiedFactor) redirect("/security");
  }
  return (
    <>
      <h1 className="text-3xl font-bold">{replace ? s.replaceTitle : s.setupTitle}</h1>
      <p className="text-lg text-stone-600">{replace ? s.replaceIntro : s.setupIntro}</p>
      <MfaSetupWizard replace={replace} doneHref={replace ? "/security/settings" : "/security"} />
      {!replace && <SignOutButton />}
    </>
  );
}