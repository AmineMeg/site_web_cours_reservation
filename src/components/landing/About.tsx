import { t } from "@/lib/i18n";
import { siteConfig } from "@/lib/config";
import type { HomepageContent } from "@/lib/website-content";

export function About({ content }: { content?: HomepageContent }) {
  const name = content?.teacherName ?? siteConfig.teacherName;
  const a = content ? {
    title: content.aboutTitle, role: content.aboutRole,
    paragraphs: [content.aboutParagraph1, content.aboutParagraph2, content.aboutParagraph3],
    stats: [
      { value: content.stat1Value, label: content.stat1Label },
      { value: content.stat2Value, label: content.stat2Label },
      { value: content.stat3Value, label: content.stat3Label },
    ],
  } : t.landing.about;
  return (
    <section id="about" className="scroll-mt-20 bg-white py-20">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 md:grid-cols-[1fr_1.4fr] md:items-center">
        {/* Replace this block with <Image src="/teacher.jpg" .../> once a real photo is available. */}
        <div
          role="img"
          aria-label={name}
          className="mx-auto flex aspect-[4/5] w-full max-w-sm items-center justify-center rounded-3xl bg-gradient-to-br from-accent-200 to-brand-200 text-9xl shadow-lg"
        >
          👩‍🏫
        </div>
        <div>
          <h2 className="text-3xl font-bold sm:text-4xl">{a.title}</h2>
          <p className="mt-2 text-xl font-semibold text-brand-700">
            {name} — {a.role}
          </p>
          <div className="mt-6 space-y-4 text-lg leading-relaxed text-stone-700">
            {a.paragraphs.map((p, index) => (
              <p key={index}>{p}</p>
            ))}
          </div>
          <dl className="mt-8 grid grid-cols-3 gap-4">
            {a.stats.map((s, index) => (
              <div key={index} className="rounded-2xl bg-stone-50 p-4 text-center">
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
