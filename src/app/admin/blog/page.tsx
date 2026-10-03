import Link from "next/link";
import { getSettings, requireTeacher } from "@/lib/auth";
import { blogText as t } from "@/lib/i18n/blog";
import { buttonClass } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";

export default async function AdminBlogPage() {
  const { supabase } = await requireTeacher();
  const { data, error } = await supabase.from("blog_posts").select("id,title,status,updated_at").order("updated_at", { ascending: false });
  if (error) throw new Error(t.errors.load);
  const settings = await getSettings(supabase);
  return <>
    <div className="mb-8 flex flex-wrap items-start justify-between gap-5"><div><h1 className="text-4xl font-extrabold">{t.adminTitle}</h1><p className="mt-3 max-w-xl text-lg text-stone-600">{t.adminSubtitle}</p></div><Link href="/admin/blog/new" className={buttonClass("primary", "lg")}>{t.newPost}</Link></div>
    {!data?.length && <div className="rounded-2xl border border-dashed border-stone-300 p-10 text-xl">{t.firstArticle}</div>}
    <div className="space-y-4">{data?.map((post) => <Link key={post.id} href={`/admin/blog/${post.id}`} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-6 hover:border-brand-500">
      <div><h2 className="text-2xl font-bold">{post.title}</h2><p className="mt-2 text-stone-500">{t.updated(formatDate(post.updated_at, settings.timezone))}</p></div><span className={`rounded-full px-4 py-2 font-bold ${post.status === "published" ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-600"}`}>{post.status === "published" ? t.published : t.draft} · {t.editLink}</span>
    </Link>)}</div>
  </>;
}
