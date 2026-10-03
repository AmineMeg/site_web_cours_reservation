import { SetPasswordForm } from "@/components/AccountLinkForms";
import { requirePasswordFlow } from "@/lib/password-flow";
import { accountText as a } from "@/lib/i18n/account";

export default async function SetPasswordPage() {
  await requirePasswordFlow();
  return (
    <>
      <h1 className="text-3xl font-bold">{a.setTitle}</h1>
      <p className="text-lg text-stone-600">{a.setIntro}</p>
      <SetPasswordForm />
    </>
  );
}
