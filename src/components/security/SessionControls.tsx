"use client";

import { useState, useTransition } from "react";
import { signOutEverywhere, signOutOtherDevices } from "@/app/security/actions";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/Notice";
import { securityText as s } from "@/lib/i18n/security";
import type { ActionResult } from "@/lib/types";

export function SessionControls() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function run(action: () => Promise<ActionResult>) {
    setResult(null);
    startTransition(async () => setResult(await action()));
  }

  return (
    <div className="space-y-3">
      {result && <Notice ok={result.ok}>{result.message}</Notice>}
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={pending} onClick={() => run(signOutOtherDevices)} className={buttonClass("secondary", "md")}>
          {pending ? s.signingOut : s.signOutOthers}
        </button>
        <button type="button" disabled={pending} onClick={() => run(signOutEverywhere)} className={buttonClass("danger", "md")}>
          {s.signOutAll}
        </button>
      </div>
    </div>
  );
}