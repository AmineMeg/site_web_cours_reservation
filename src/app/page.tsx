import type { Metadata } from "next";
import { Homepage } from "@/components/landing/Homepage";
import { getHomepage, getPublicSettings } from "@/lib/website";
import { getPublicReviews } from "@/lib/reviews";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { content } = await getHomepage();
  return { title: content.siteName, description: content.heroSubtitle };
}

export default async function HomePage() {
  const [{ content }, reviews, settings] = await Promise.all([getHomepage(), getPublicReviews(), getPublicSettings()]);
  return <Homepage content={content} reviews={reviews} creditValidityMonths={settings.credit_validity_months} />;
}
