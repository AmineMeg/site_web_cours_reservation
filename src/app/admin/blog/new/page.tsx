import { requireTeacher } from "@/lib/auth";
import { supabaseUrl } from "@/lib/supabase/env";
import { BlogEditor } from "@/components/blog/Editor";

export default async function NewBlogPost() {
  await requireTeacher();
  return <BlogEditor imageOrigin={supabaseUrl()} />;
}
