import Link from "next/link";
import { t } from "@/lib/i18n";
import { buttonClass } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-extrabold text-brand-700">
          ¡Hola! <span className="text-stone-900">{t.common.appName}</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-4">
          <a href="#about" className="hidden px-2 py-2 font-medium text-stone-700 hover:text-brand-700 md:block">
            {t.nav.about}
          </a>
          <a href="#testimonials" className="hidden px-2 py-2 font-medium text-stone-700 hover:text-brand-700 md:block">
            {t.nav.testimonials}
          </a>
          <a href="#contact" className="hidden px-2 py-2 font-medium text-stone-700 hover:text-brand-700 md:block">
            {t.nav.contact}
          </a>
          <Link href="/login" className={buttonClass("secondary", "md")}>
            {t.nav.login}
          </Link>
        </nav>
      </div>
    </header>
  );
}
