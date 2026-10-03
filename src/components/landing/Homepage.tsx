import { SiteHeader } from "./SiteHeader";
import { Hero } from "./Hero";
import { About } from "./About";
import { Testimonials } from "./Testimonials";
import { ContactForm } from "./ContactForm";
import type { HomepageContent } from "@/lib/website-content";
import { HomepageText } from "./HomepageText";
import type { PublicReview } from "@/lib/reviews";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";

export function Homepage({ content, preview = false, reviews = [], creditValidityMonths = 12 }: {
  content: HomepageContent; preview?: boolean; reviews?: PublicReview[]; creditValidityMonths?: number;
}) {
  return (
    <>
      <SiteHeader content={content} preview={preview} hasReviews={preview || reviews.length > 0} />
      <main>
        <Hero content={content} preview={preview} />
        <About content={content} />
        <Testimonials content={content} reviews={reviews} preview={preview} />
        <section id="contact" className="scroll-mt-20 bg-white py-20">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="text-center text-3xl font-bold sm:text-4xl"><HomepageText field="contactTitle">{content.contactTitle}</HomepageText></h2>
            <p className="mb-10 mt-4 text-center text-lg text-stone-600"><HomepageText field="contactSubtitle">{content.contactSubtitle}</HomepageText></p>
            <div className="card relative"><ContactForm content={content} preview={preview} /></div>
            <aside className="mt-6 space-y-3 rounded-2xl bg-stone-50 p-6 text-stone-700">
              <p className="font-semibold">{r.online}</p>
              <p>{r.cancellation}</p><p>{r.validity(creditValidityMonths)}</p>
            </aside>
          </div>
        </section>
      </main>
      <footer className="bg-stone-900 py-8 text-center text-stone-300">
        © {new Date().getFullYear()} <HomepageText field="footerText">{content.footerText}</HomepageText>
      </footer>
    </>
  );
}
