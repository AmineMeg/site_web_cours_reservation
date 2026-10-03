"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { supabaseUrl } from "@/lib/supabase/env";
import { MAX_DOCUMENT_BYTES, validatePost } from "@/lib/blog/validation";
import { blogText as t } from "@/lib/i18n/blog";

export type BlogActionResult = { error?: string; id?: string; updatedAt?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function saveBlogPost(input: {
  id?: string; updatedAt?: string; title: string; slug: string; excerpt: string;
  document: unknown; cover_image: string | null; status: string;
}): Promise<BlogActionResult> {
  const { supabase } = await requireTeacher();
  let post;
  try {
    let document = input.document;
    // A JSON string avoids React Flight temporary references for editor attributes.
    if (typeof document === "string") {
      if (new TextEncoder().encode(document).length > MAX_DOCUMENT_BYTES) {
        return { error: t.errors.tooLarge };
      }
      document = JSON.parse(document);
    }
    post = validatePost({ ...input, document }, supabaseUrl());
  }
  catch (error) { return { error: error instanceof SyntaxError ? t.invalidArticle : error instanceof Error ? error.message : t.invalidArticle }; }
  if (input.id && (!uuid.test(input.id) || !input.updatedAt)) return { error: t.invalidArticle };
  const id = input.id ?? randomUUID();
  if (input.id) {
    const { data, error } = await supabase.from("blog_posts").select("slug").eq("id", id).maybeSingle();
    if (error || !data) return { error: t.notFound };
    if (data.slug !== post.slug) return { error: t.errors.slugImmutable };
  }
  const query = input.id
    ? supabase.from("blog_posts").update(post).eq("id", id).eq("updated_at", input.updatedAt!)
    : supabase.from("blog_posts").insert({ ...post, id });
  const { data, error } = await query.select("updated_at").maybeSingle();
  if (error) return { error: error.code === "23505" ? t.errors.slugTaken : t.saveFailed };
  if (!data) return { error: t.errors.conflict };
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  return { id, updatedAt: data.updated_at };
}

export async function deleteBlogPost(id: string, updatedAt: string): Promise<BlogActionResult> {
  const { supabase } = await requireTeacher();
  if (!uuid.test(id) || typeof updatedAt !== "string") return { error: t.invalidArticle };
  const { data, error } = await supabase.from("blog_posts").delete()
    .eq("id", id).eq("updated_at", updatedAt).select("slug").maybeSingle();
  if (error) return { error: t.deleteFailed };
  if (!data) return { error: t.errors.conflict };
  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  revalidatePath(`/blog/${data.slug}`);
  return {};
}
