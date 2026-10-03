import Link from "next/link";
import { t } from "@/lib/i18n";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-20">
    <h1 className="text-3xl font-bold">{t.common.notFound}</h1>
    <p className="text-lg">{t.common.notFoundHelp}</p>
    <Link href="/" className={buttonClass("primary", "lg")}>{t.common.home}</Link>
  </main>;
}
