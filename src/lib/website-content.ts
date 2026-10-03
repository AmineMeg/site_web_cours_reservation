import { t } from "@/lib/i18n";
import { siteConfig } from "@/lib/config";

export const homepageDefaults = {
  siteName: t.common.appName,
  teacherName: siteConfig.teacherName,
  footerText: `${t.common.appName}. All rights reserved.`,
  heroBadge: t.landing.hero.badge,
  heroTitle: t.landing.hero.title,
  heroSubtitle: t.landing.hero.subtitle,
  heroPrimary: t.landing.hero.ctaPrimary,
  heroSecondary: t.landing.hero.ctaSecondary,
  aboutTitle: t.landing.about.title,
  aboutRole: t.landing.about.role,
  aboutParagraph1: t.landing.about.paragraphs[0],
  aboutParagraph2: t.landing.about.paragraphs[1],
  aboutParagraph3: t.landing.about.paragraphs[2],
  stat1Value: t.landing.about.stats[0].value, stat1Label: t.landing.about.stats[0].label,
  stat2Value: t.landing.about.stats[1].value, stat2Label: t.landing.about.stats[1].label,
  stat3Value: t.landing.about.stats[2].value, stat3Label: t.landing.about.stats[2].label,
  testimonialsTitle: t.landing.testimonials.title,
  testimonial1Quote: t.landing.testimonials.items[0].quote, testimonial1Name: t.landing.testimonials.items[0].name, testimonial1Detail: t.landing.testimonials.items[0].detail,
  testimonial2Quote: t.landing.testimonials.items[1].quote, testimonial2Name: t.landing.testimonials.items[1].name, testimonial2Detail: t.landing.testimonials.items[1].detail,
  testimonial3Quote: t.landing.testimonials.items[2].quote, testimonial3Name: t.landing.testimonials.items[2].name, testimonial3Detail: t.landing.testimonials.items[2].detail,
  contactTitle: t.landing.contact.title, contactSubtitle: t.landing.contact.subtitle,
  contactName: t.landing.contact.name, contactEmail: t.landing.contact.email,
  contactPhone: t.landing.contact.phone, contactMessage: t.landing.contact.message,
  contactPlaceholder: t.landing.contact.messagePlaceholder, contactSubmit: t.landing.contact.submit,
};

export type HomepageContent = { [K in keyof typeof homepageDefaults]: string };
export type HomepageKey = keyof HomepageContent;
export type HomepageSection = "identity" | "hero" | "about" | "testimonials" | "contact";
export const homepageSections: Record<HomepageSection, HomepageKey[]> = {
  identity: ["siteName", "teacherName", "footerText"],
  hero: ["heroBadge", "heroTitle", "heroSubtitle", "heroPrimary", "heroSecondary"],
  about: ["aboutTitle", "aboutRole", "aboutParagraph1", "aboutParagraph2", "aboutParagraph3", "stat1Value", "stat1Label", "stat2Value", "stat2Label", "stat3Value", "stat3Label"],
  testimonials: ["testimonialsTitle", "testimonial1Quote", "testimonial1Name", "testimonial1Detail", "testimonial2Quote", "testimonial2Name", "testimonial2Detail", "testimonial3Quote", "testimonial3Name", "testimonial3Detail"],
  contact: ["contactTitle", "contactSubtitle", "contactName", "contactEmail", "contactPhone", "contactMessage", "contactPlaceholder", "contactSubmit"],
};
export function homepageFieldLimit(key: HomepageKey): number {
  return /Paragraph|Quote|Subtitle/.test(key) ? 2000 : 200;
}

export function parseHomepageContent(value: unknown): HomepageContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source: Record<string, unknown> = Object.fromEntries(Object.entries(value));
  if (Object.keys(source).length !== Object.keys(homepageDefaults).length) return null;
  const result: HomepageContent = { ...homepageDefaults };
  for (const key of Object.keys(homepageDefaults) as HomepageKey[]) {
    const entry = source[key];
    if (typeof entry !== "string" || !entry.trim() || entry.length > homepageFieldLimit(key)) return null;
    result[key] = entry.trim();
  }
  return result;
}
