import type { CreditBatch } from "@/lib/types";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { t } from "@/lib/i18n";

export function CreditExpiryList({ batches, timezone }: { batches: CreditBatch[]; timezone: string }) {
  return <section className="card space-y-3">
    <h2 className="text-xl font-bold">{r.expires}</h2>
    {batches.length === 0 ? <p>{t.dashboard.booking.noCredits}</p> : <ul className="space-y-2">
      {batches.map((batch) => <li key={batch.id}>
        {t.common.credits(batch.remaining)} · {r.until} {new Intl.DateTimeFormat(t.locale, {
          year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
          timeZone: timezone, timeZoneName: "shortOffset",
        }).format(new Date(batch.expires_at))}
      </li>)}
    </ul>}
    <p className="text-sm text-stone-600">{r.refund}</p>
  </section>;
}
