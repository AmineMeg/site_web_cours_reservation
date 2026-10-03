import { requireTeacher } from "@/lib/auth";
import { getHomepage } from "@/lib/website";
import { WebsiteEditor } from "@/components/admin/WebsiteEditor";
import { getPublicReviews } from "@/lib/reviews";

export default async function WebsitePage() {
  await requireTeacher();
  const [homepage, reviews] = await Promise.all([getHomepage(), getPublicReviews()]);
  return <WebsiteEditor initial={homepage.content} revision={homepage.revision} reviews={reviews} />;
}
