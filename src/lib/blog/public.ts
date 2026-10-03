import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { validateDocument, validImageUrl, type BlogPost } from "./validation";
import { blogText as t } from "@/lib/i18n/blog";
import { defaultSettings } from "@/lib/config";

// Deliberately never receives cookies: an AAL1 visitor can still read published articles.
function publicClient() {
  return createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
export async function publishedTimezone(): Promise<string> {
  const { data, error } = await publicClient().from("app_settings").select("timezone").eq("id", 1).maybeSingle();
  if (error) throw new Error(t.timezoneFailed);
  return data?.timezone ?? defaultSettings.timezone;
}
export async function publishedPosts(page = 1) {
  const pageSize = 12;
  const { data, error } = await publicClient().from("blog_posts")
    .select("id,title,slug,excerpt,cover_image,published_at")
    .eq("status", "published").order("published_at", { ascending: false }).order("id")
    .range((page - 1) * pageSize, page * pageSize);
  if (error) throw new Error(t.errors.load);
  const posts = (data ?? []).slice(0, pageSize).map((post) => ({ ...post, cover_image: validImageUrl(post.cover_image, supabaseUrl()) ? post.cover_image : null })) as Pick<BlogPost, "id" | "title" | "slug" | "excerpt" | "cover_image" | "published_at">[];
  return { posts, hasNext: (data?.length ?? 0) > pageSize };
}
export async function publishedPost(slug: string): Promise<BlogPost | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  const { data, error } = await publicClient().from("blog_posts").select("*")
    .eq("status", "published").eq("slug", slug).maybeSingle();
  if (error) throw new Error(t.errors.loadPost);
  if (!data) return null;
  try {
    return { ...data, document: validateDocument(data.document, supabaseUrl()), cover_image: validImageUrl(data.cover_image, supabaseUrl()) ? data.cover_image : null } as BlogPost;
  } catch {
    return null;
  }
}
