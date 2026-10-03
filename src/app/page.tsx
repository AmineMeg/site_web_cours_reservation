import { SiteHeader } from "@/components/landing/SiteHeader";
import { Hero } from "@/components/landing/Hero";
import { About } from "@/components/landing/About";
import { Testimonials } from "@/components/landing/Testimonials";
import { ContactForm } from "@/components/landing/ContactForm";
import { t } from "@/lib/i18n";

export default function HomePage() {
  const c = t.landing.contact;
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <About />
        <Testimonials />
        <section id="contact" className="scroll-mt-20 bg-white py-20">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="text-center text-3xl font-bold sm:text-4xl">{c.title}</h2>
            <p className="mb-10 mt-4 text-center text-lg text-stone-600">{c.subtitle}</p>
            <div className="card relative">
              <ContactForm />
            </div>
          </div>
        </section>
      </main>
      <footer className="bg-stone-900 py-8 text-center text-stone-300">
        {t.landing.footer.rights(new Date().getFullYear())}
      </footer>
    </>
  );
}
