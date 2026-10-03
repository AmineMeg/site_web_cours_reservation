import Link from "next/link";
import { requireStudent } from "@/lib/auth";
import { StudentNav } from "@/components/dashboard/StudentNav";
import { signOut } from "@/app/actions/auth";
import { t } from "@/lib/i18n";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStudent();

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="text-xl font-extrabold text-brand-700">
            {t.common.appName}
          </Link>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-accent-100 px-4 py-2 font-bold text-accent-900">
              🎟️ {t.dashboard.creditsBadge(profile.credits)}
            </span>
            <form action={signOut}>
              <button type="submit" className="min-h-11 rounded-xl px-3 text-stone-700 underline hover:bg-stone-100">
                {t.common.signOut}
              </button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-3">
          <StudentNav />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <p className="mb-6 text-2xl font-semibold">{t.dashboard.hello(profile.full_name.split(" ")[0] || "")}</p>
        {children}
      </main>
    </div>
  );
}
