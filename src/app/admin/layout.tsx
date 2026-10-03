import { requireTeacher } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { signOut } from "@/app/actions/auth";
import { CONTACT_RETENTION_DAYS } from "@/lib/config";
import { t } from "@/lib/i18n";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireTeacher();

  const since = new Date(Date.now() - CONTACT_RETENTION_DAYS * 86400_000).toISOString();
  const { count } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .is("converted_at", null)
    .gte("created_at", since);

  return (
    <div className="min-h-screen md:flex">
      <AdminSidebar teacherName={profile.full_name || profile.email} newContacts={count ?? 0} />
      <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-5xl">{children}</div>
        <form action={signOut} className="mt-12 md:hidden">
          <button type="submit" className="text-lg text-stone-600 underline">
            {t.common.signOut}
          </button>
        </form>
      </main>
    </div>
  );
}
