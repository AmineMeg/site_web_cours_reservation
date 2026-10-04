"use client";

import { useState, useTransition } from "react";
import { deleteStudentMessage } from "@/app/admin/actions";
import { removalText as d } from "@/lib/i18n/removal";
import { buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/Notice";
import type { ActionResult } from "@/lib/types";

export function DeleteMessageButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return <div className="space-y-3">
    <button type="button" disabled={pending} className={buttonClass("danger", "lg")}
      onClick={() => {
        if (window.confirm(d.messageConfirm)) startTransition(async () => setResult(await deleteStudentMessage(id)));
      }}>🗑️ {d.deleteMessage}</button>
    {result && <Notice ok={result.ok}>{result.message}</Notice>}
  </div>;
}
