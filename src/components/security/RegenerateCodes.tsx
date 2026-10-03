"use client";

import { useState, useTransition } from "react";
import { regenerateRecoveryCodes } from "@/app/security/actions";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/Notice";
import { RecoveryCodesDisplay } from "./RecoveryCodesDisplay";
import { securityText as s } from "@/lib/i18n/security";

export function RegenerateCodes() {
  const [pending, startTransition] = useTransition();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [message, setMessage] = useState("");

  function regenerate() {
    setMessage("");
    startTransition(async () => {
      const result = await regenerateRecoveryCodes();
      if (result.ok && result.codes) setCodes(result.codes);
      else setMessage(result.message);
    });
  }

  if (codes) return <RecoveryCodesDisplay codes={codes} />;
  return (
    <div className="space-y-3">
      <p className="text-stone-600">{s.regenerateIntro}</p>
      {message && <Notice ok={false}>{message}</Notice>}
      <button type="button" onClick={regenerate} disabled={pending} className={buttonClass("secondary", "md")}>
        {pending ? s.regenerating : s.regenerateCodes}
      </button>
    </div>
  );
}