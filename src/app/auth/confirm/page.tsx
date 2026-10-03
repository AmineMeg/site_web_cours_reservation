import { ConfirmAccountForm } from "@/components/AccountLinkForms";
import { Notice } from "@/components/ui/Notice";
import { accountText as a } from "@/lib/i18n/account";
import { validAccountToken } from "@/lib/account-token";

export default async function ConfirmPage({ searchParams }: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  const valid = validAccountToken(params.token_hash)
    && (params.type === "invite" || params.type === "recovery");
  return (
    <>
      <h1 className="text-3xl font-bold">{a.linkTitle}</h1>
      <p className="text-lg text-stone-600">{a.linkIntro}</p>
      {valid ? <ConfirmAccountForm tokenHash={params.token_hash!} type={params.type!} />
        : <Notice ok={false}>{a.invalidLink}</Notice>}
    </>
  );
}
