"use client";

import { t } from "@/lib/i18n";
import { buttonClass } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-20">
    <h1 role="alert" className="text-2xl font-bold">{t.common.error}</h1>
    <button onClick={reset} className={buttonClass("primary", "lg")}>{t.common.retry}</button>
  </main>;
}
