import { requireTeacher } from "@/lib/auth";
import { getHomepage } from "@/lib/website";
import { WebsiteEditor } from "@/components/admin/WebsiteEditor";

export default async function WebsitePage() {
  await requireTeacher();
  const homepage = await getHomepage();
  return <WebsiteEditor initial={homepage.content} revision={homepage.revision} />;
}
