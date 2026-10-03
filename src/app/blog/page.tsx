import Link from "next/link";
import type { Metadata } from "next";
import { publishedPosts } from "@/lib/blog/public";
import { blogText as t } from "@/lib/i18n/blog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Spanish learning blog", description: t.subtitle };

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const requested = (await searchParams).page ?? "1";
  const page = /^[0-9]{1,5}$/.test(requested) ? Math.max(1, Number(requested)) : 1;
  const { posts, hasNext } = await publishedPosts(page);
  return <>
    <header className="mb-12"><p className="mb-3 font-bold uppercase tracking-widest text-brand-700">Blog</p><h1 className="text-4xl font-extrabold sm:text-5xl">{t.title}</h1><p className="mt-4 text-xl text-stone-600">{t.subtitle}</p></header>
    {!posts.length ? <p className="rounded-2xl bg-white p-8 text-xl">{t.empty}</p> : <div className="grid gap-8 sm:grid-cols-2">
      {posts.map((post) => <article key={post.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <Link href={`/blog/${post.slug}`} className="block h-full focus-visible:outline-brand-700">
          {post.cover_image && <img src={post.cover_image} alt="" className="h-56 w-full object-cover" loading="lazy" />}
          <div className="p-7">{post.published_at && <time dateTime={post.published_at} className="text-sm text-stone-500">{new Date(post.published_at).toLocaleDateString("en-GB", { dateStyle: "long", timeZone: "UTC" })}</time>}<h2 className="mt-2 text-2xl font-bold">{post.title}</h2><p className="mt-3 leading-7 text-stone-600">{post.excerpt}</p><p className="mt-5 font-bold text-brand-700">Read article →</p></div>
        </Link>
      </article>)}
    </div>}
    {(page > 1 || hasNext) && <nav aria-label="Blog pages" className="mt-10 flex items-center justify-between gap-4">
      {page > 1 ? <Link href={`/blog?page=${page - 1}`} className="rounded-xl border bg-white px-5 py-3 font-bold">← Newer articles</Link> : <span />}
      <span className="text-stone-500">Page {page}</span>
      {hasNext ? <Link href={`/blog?page=${page + 1}`} className="rounded-xl border bg-white px-5 py-3 font-bold">Older articles →</Link> : <span />}
    </nav>}
  </>;
}
