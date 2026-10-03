import { SiteHeader } from "./SiteHeader";
import { Hero } from "./Hero";
import { About } from "./About";
import { Testimonials } from "./Testimonials";
import { ContactForm } from "./ContactForm";
import type { HomepageContent } from "@/lib/website-content";
import { HomepageText } from "./HomepageText";

export function Homepage({ content, preview = false }: { content: HomepageContent; preview?: boolean }) {
  return (
    <>
      <SiteHeader content={content} preview={preview} />
      <main>
        <Hero content={content} preview={preview} />
        <About content={content} />
        <Testimonials content={content} />
        <section id="contact" className="scroll-mt-20 bg-white py-20">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="text-center text-3xl font-bold sm:text-4xl"><HomepageText field="contactTitle">{content.contactTitle}</HomepageText></h2>
            <p className="mb-10 mt-4 text-center text-lg text-stone-600"><HomepageText field="contactSubtitle">{content.contactSubtitle}</HomepageText></p>
            <div className="card relative"><ContactForm content={content} preview={preview} /></div>
          </div>
        </section>
      </main>
      <footer className="bg-stone-900 py-8 text-center text-stone-300">
        © {new Date().getFullYear()} <HomepageText field="footerText">{content.footerText}</HomepageText>
      </footer>
    </>
  );
}
