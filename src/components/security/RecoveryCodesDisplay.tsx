"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { securityText as s } from "@/lib/i18n/security";

/** Shows freshly generated recovery codes once (they are never retrievable again). */
export function RecoveryCodesDisplay({ codes, doneHref }: { codes: string[]; doneHref?: string }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const text = codes.join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = s.codesFileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-4" aria-labelledby="recovery-codes-title">
      <h2 id="recovery-codes-title" className="text-2xl font-bold">{s.codesTitle}</h2>
      <p className="text-lg text-stone-600">{s.codesIntro}</p>
      <ol className="grid gap-2 rounded-xl border-2 border-stone-200 bg-stone-50 p-4 font-mono text-lg sm:grid-cols-2">
        {codes.map((code) => (
          <li key={code} className="select-all">{code}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={copy} className={buttonClass("secondary", "md")}>
          {copied ? s.codesCopied : s.codesCopy}
        </button>
        <button type="button" onClick={download} className={buttonClass("secondary", "md")}>
          {s.codesDownload}
        </button>
      </div>
      {doneHref && (
        <>
          <label className="flex items-center gap-3 text-lg">
            <input type="checkbox" className="h-6 w-6" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            {s.codesSaved}
          </label>
          {saved && (
            <Link href={doneHref} className={buttonClass("primary", "lg", "w-full")}>
              {s.continue}
            </Link>
          )}
        </>
      )}
    </section>
  );
}