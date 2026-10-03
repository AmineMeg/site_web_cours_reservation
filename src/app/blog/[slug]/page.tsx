import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { publishedPost } from "@/lib/blog/public";
import { BlogDocument } from "@/components/blog/Document";
import { blogText as t } from "@/lib/i18n/blog";

export const dynamic = "force-dynamic";
const getPost = cache(publishedPost);
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return { title: "Article not found", robots: { index: false, follow: false } };
  return { title: post.title, description: post.excerpt, openGraph: { title: post.title, description: post.excerpt, ...(post.cover_image ? { images: [post.cover_image] } : {}) } };
}
export default async function ArticlePage({ params }: Props) {
  const post = await getPost((await params).slug);
  if (!post) notFound();
  return <article className="mx-auto max-w-3xl">
    <Link href="/blog" className="font-bold text-brand-700">← {t.back}</Link>
    <header className="my-8"><h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">{post.title}</h1>{post.published_at && <time dateTime={post.published_at} className="mt-5 block text-stone-500">{new Date(post.published_at).toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "UTC" })}</time>}<p className="mt-6 text-xl leading-8 text-stone-600">{post.excerpt}</p></header>
    {post.cover_image && <img src={post.cover_image} alt="" className="mb-10 max-h-[480px] w-full rounded-2xl object-cover" />}
    <BlogDocument document={post.document} />
  </article>;
}
