import { t } from "@/lib/i18n";

export function Testimonials() {
  const s = t.landing.testimonials;
  return (
    <section id="testimonials" className="scroll-mt-20 bg-stone-50 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="text-center text-3xl font-bold sm:text-4xl">{s.title}</h2>
        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {s.items.map((item) => (
            <li key={item.name} className="card flex flex-col">
              <p aria-hidden className="text-2xl text-accent-500">
                ★★★★★
              </p>
              <blockquote className="mt-4 flex-1 text-lg leading-relaxed text-stone-700">“{item.quote}”</blockquote>
              <footer className="mt-6 border-t border-stone-100 pt-4">
                <p className="font-bold text-stone-900">{item.name}</p>
                <p className="text-sm text-stone-500">{item.detail}</p>
              </footer>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
