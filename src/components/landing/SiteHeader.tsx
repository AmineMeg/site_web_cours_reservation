import Link from "next/link";
import { t } from "@/lib/i18n";
import { buttonClass } from "@/components/ui/button";
import type { HomepageContent } from "@/lib/website-content";
import { HomepageText } from "./HomepageText";

export function SiteHeader({ content, preview = false, hasReviews = true }: { content?: HomepageContent; preview?: boolean; hasReviews?: boolean }) {
  const brand = <>¡Hola! <span className="text-stone-900"><HomepageText field="siteName">{content?.siteName ?? t.common.appName}</HomepageText></span></>;
  return (
    <header className={`${preview ? "" : "sticky top-0 z-40 "}border-b border-stone-200 bg-white/90 backdrop-blur`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        {preview ? <div className="text-xl font-extrabold text-brand-700">{brand}</div> :
          <Link href="/" className="text-xl font-extrabold text-brand-700">{brand}</Link>}
        {!preview && <nav className="flex items-center gap-1 sm:gap-4">
          <a href="/#about" className="hidden px-2 py-2 font-medium text-stone-700 hover:text-brand-700 md:block">
            {t.nav.about}
          </a>
          {hasReviews && <a href="/#testimonials" className="hidden px-2 py-2 font-medium text-stone-700 hover:text-brand-700 md:block">
            {t.nav.testimonials}
          </a>}
          <a href="/#contact" className="hidden px-2 py-2 font-medium text-stone-700 hover:text-brand-700 md:block">
            {t.nav.contact}
          </a>
          <Link href="/blog" className="px-2 py-2 font-medium text-stone-700 hover:text-brand-700">
            {t.nav.blog}
          </Link>
          <Link href="/login" className={buttonClass("secondary", "md")}>
            {t.nav.login}
          </Link>
        </nav>}
      </div>
    </header>
  );
}
