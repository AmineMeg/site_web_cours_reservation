import { t } from "@/lib/i18n";
import { siteConfig } from "@/lib/config";

export function About() {
  const a = t.landing.about;
  return (
    <section id="about" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 md:grid-cols-[1fr_1.4fr] md:items-center">
        {/* Replace this block with <Image src="/teacher.jpg" .../> once a real photo is available. */}
        <div
          role="img"
          aria-label={siteConfig.teacherName}
          className="mx-auto flex aspect-[4/5] w-full max-w-sm items-center justify-center rounded-3xl bg-gradient-to-br from-accent-200 to-brand-200 text-9xl shadow-lg"
        >
          👩‍🏫
        </div>
        <div>
          <h2 className="text-3xl font-bold sm:text-4xl">{a.title}</h2>
          <p className="mt-2 text-xl font-semibold text-brand-700">
            {siteConfig.teacherName} — {a.role}
          </p>
          <div className="mt-6 space-y-4 text-lg leading-relaxed text-stone-700">
            {a.paragraphs.map((p) => (
              <p key={p.slice(0, 20)}>{p}</p>
            ))}
          </div>
          <dl className="mt-8 grid grid-cols-3 gap-4">
            {a.stats.map((s) => (
              <div key={s.label} className="rounded-2xl bg-stone-50 p-4 text-center">
                <dt className="sr-only">{s.label}</dt>
                <dd className="text-3xl font-extrabold text-brand-700">{s.value}</dd>
                <dd className="text-sm text-stone-600">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
