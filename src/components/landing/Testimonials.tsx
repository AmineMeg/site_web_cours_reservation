import { t } from "@/lib/i18n";
import type { HomepageContent } from "@/lib/website-content";
import type { PublicReview } from "@/lib/reviews";
import { reviewText as r } from "@/lib/i18n/reviews";
import { HomepageText } from "./HomepageText";

export function Testimonials({ content, reviews = [], preview = false }: {
  content?: HomepageContent; reviews?: PublicReview[]; preview?: boolean;
}) {
  if (!reviews.length && !preview) return null;
  return <section id="testimonials" className="scroll-mt-20 bg-stone-50 py-20">
    <div className="mx-auto max-w-6xl px-4">
      <h2 className="text-center text-3xl font-bold sm:text-4xl">
        <HomepageText field="testimonialsTitle">{content?.testimonialsTitle ?? t.landing.testimonials.title}</HomepageText>
      </h2>
      {reviews.length ? <ul className="mt-12 grid gap-6 md:grid-cols-3">
        {reviews.map((review) => <li key={review.id} className="card flex flex-col">
          <blockquote className="flex-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-lg leading-relaxed text-stone-700">“{review.quote}”</blockquote>
          <footer className="mt-6 border-t border-stone-100 pt-4">
            <p className="[overflow-wrap:anywhere] font-bold text-stone-900">{review.display_name}</p>
          </footer>
        </li>)}
      </ul> : <p className="card mt-8 text-center text-lg text-stone-600">{r.previewEmpty}</p>}
    </div>
  </section>;
}
