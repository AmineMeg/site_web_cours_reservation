import { requireTeacher, getSettings } from "@/lib/auth";
import { getHomepage } from "@/lib/website";
import { WebsiteEditor } from "@/components/admin/WebsiteEditor";
import { getPublicReviews } from "@/lib/reviews";

export default async function WebsitePage() {
  const { supabase } = await requireTeacher();
  const [homepage, reviews, settings] = await Promise.all([getHomepage(), getPublicReviews(), getSettings(supabase)]);
  return <WebsiteEditor initial={homepage.content} revision={homepage.revision} reviews={reviews}
    creditValidityMonths={settings.credit_validity_months} />;
}
