import { ForgotPasswordForm } from "@/components/AccountLinkForms";
import { Notice } from "@/components/ui/Notice";
import { accountText as a } from "@/lib/i18n/account";

export default async function ForgotPasswordPage({ searchParams }: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  return (
    <>
      <h1 className="text-3xl font-bold">{a.forgotTitle}</h1>
      <p className="text-lg text-stone-600">{a.forgotIntro}</p>
      {expired && <Notice ok={false}>{a.invalidLink}</Notice>}
      <ForgotPasswordForm />
    </>
  );
}
