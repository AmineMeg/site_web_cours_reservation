import { t } from "@/lib/i18n";
import type { HomepageContent, HomepageKey } from "@/lib/website-content";
import { HomepageText } from "./HomepageText";

export function Testimonials({ content }: { content?: HomepageContent }) {
  const s = content ? {
    title: content.testimonialsTitle,
    items: [
      { quote: content.testimonial1Quote, name: content.testimonial1Name, detail: content.testimonial1Detail },
      { quote: content.testimonial2Quote, name: content.testimonial2Name, detail: content.testimonial2Detail },
      { quote: content.testimonial3Quote, name: content.testimonial3Name, detail: content.testimonial3Detail },
    ],
  } : t.landing.testimonials;
  return (
    <section id="testimonials" className="scroll-mt-20 bg-stone-50 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center text-3xl font-bold sm:text-4xl"><HomepageText field="testimonialsTitle">{s.title}</HomepageText></h2>
        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {s.items.map((item, index) => (
            <li key={index} className="card flex flex-col">
              <p aria-hidden className="text-2xl text-accent-500">
                ★★★★★
              </p>
              <blockquote className="mt-4 flex-1 text-lg leading-relaxed text-stone-700">“<HomepageText field={`testimonial${index + 1}Quote` as HomepageKey}>{item.quote}</HomepageText>”</blockquote>
              <footer className="mt-6 border-t border-stone-100 pt-4">
                <p className="font-bold text-stone-900"><HomepageText field={`testimonial${index + 1}Name` as HomepageKey}>{item.name}</HomepageText></p>
                <p className="text-sm text-stone-500"><HomepageText field={`testimonial${index + 1}Detail` as HomepageKey}>{item.detail}</HomepageText></p>
              </footer>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
