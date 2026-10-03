import { t } from "@/lib/i18n";
import { buttonClass } from "@/components/ui/button";

export function Hero() {
  const h = t.landing.hero;
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-50 via-white to-accent-50">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:py-28">
        <div>
          <p className="mb-4 inline-block rounded-full bg-accent-100 px-4 py-1 text-sm font-semibold text-accent-900">
            {h.badge}
          </p>
          <h1 className="text-4xl font-extrabold leading-tight text-stone-900 sm:text-5xl">{h.title}</h1>
          <p className="mt-6 text-xl leading-relaxed text-stone-700">{h.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a href="#contact" className={buttonClass("primary", "xl")}>
              {h.ctaPrimary}
            </a>
            <a href="#about" className={buttonClass("secondary", "xl")}>
              {h.ctaSecondary}
            </a>
          </div>
        </div>
        <div aria-hidden className="relative mx-auto hidden aspect-square w-full max-w-md md:block">
          <div className="absolute inset-0 rotate-6 rounded-[3rem] bg-brand-600" />
          <div className="absolute inset-0 -rotate-3 rounded-[3rem] bg-accent-400" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[3rem] bg-white text-center shadow-xl">
            <span className="text-8xl">🇪🇸</span>
            <span className="text-3xl font-bold text-stone-800">¿Hablamos?</span>
          </div>
        </div>
      </div>
    </section>
  );
}
