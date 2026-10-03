import { notFound } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { supabaseUrl } from "@/lib/supabase/env";
import { validateDocument, type BlogPost } from "@/lib/blog/validation";
import { BlogEditor } from "@/components/blog/Editor";
import { blogText } from "@/lib/i18n/blog";

export default async function EditBlogPost({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireTeacher();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data, error } = await supabase.from("blog_posts").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(blogText.errors.loadPost);
  if (!data) notFound();
  const post = { ...data, document: validateDocument(data.document, supabaseUrl()) } as BlogPost;
  return <BlogEditor post={post} imageOrigin={supabaseUrl()} />;
}
