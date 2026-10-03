"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { supabaseUrl } from "@/lib/supabase/env";
import { validatePost } from "@/lib/blog/validation";

export type BlogActionResult = { error?: string; id?: string; updatedAt?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveBlogPost(input: {
  id?: string; updatedAt?: string; title: string; slug: string; excerpt: string;
  document: unknown; cover_image: string | null; status: string;
}): Promise<BlogActionResult> {
  const { supabase } = await requireTeacher();
  let post;
  try { post = validatePost(input, supabaseUrl()); }
  catch (error) { return { error: error instanceof Error ? error.message : "Invalid article." }; }
  if (input.id && (!uuid.test(input.id) || !input.updatedAt)) return { error: "Invalid article." };
  const id = input.id ?? randomUUID();
  if (input.id) {
    const { data, error } = await supabase.from("blog_posts").select("slug").eq("id", id).maybeSingle();
    if (error || !data) return { error: "Article not found." };
    if (data.slug !== post.slug) return { error: "The URL name cannot change after the first save." };
  }
  const query = input.id
    ? supabase.from("blog_posts").update(post).eq("id", id).eq("updated_at", input.updatedAt!)
    : supabase.from("blog_posts").insert({ ...post, id });
  const { data, error } = await query.select("updated_at").maybeSingle();
  if (error) return { error: error.code === "23505" ? "This URL name is already used. Choose another one." : "Unable to save the article. Please try again." };
  if (!data) return { error: "Someone changed this article. Reload the page before saving again." };
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  return { id, updatedAt: data.updated_at };
}

export async function deleteBlogPost(id: string, updatedAt: string): Promise<BlogActionResult> {
  const { supabase } = await requireTeacher();
  if (!uuid.test(id) || typeof updatedAt !== "string") return { error: "Invalid article." };
  const { data, error } = await supabase.from("blog_posts").delete()
    .eq("id", id).eq("updated_at", updatedAt).select("slug").maybeSingle();
  if (error) return { error: "Unable to delete the article." };
  if (!data) return { error: "Article changed or no longer exists. Reload the page." };
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  revalidatePath(`/blog/${data.slug}`);
  return {};
}
