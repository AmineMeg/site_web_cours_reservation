"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { t } from "@/lib/i18n";

const items = [
  { href: "/admin/contacts", icon: "📩", label: t.admin.nav.contacts, badgeKey: "contacts" as const },
  { href: "/admin/students", icon: "👩‍🎓", label: t.admin.nav.students },
  { href: "/admin/schedule", icon: "📅", label: t.admin.nav.schedule },
  { href: "/admin/messages", icon: "✉️", label: t.admin.nav.messages },
];

export function AdminSidebar({ teacherName, newContacts }: { teacherName: string; newContacts: number }) {
  const pathname = usePathname();

  return (
    <aside className="border-b border-stone-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-72 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
      <div className="px-5 py-4 md:py-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">{t.admin.title}</p>
        <p className="text-xl font-bold">{teacherName}</p>
      </div>

      <nav className="flex gap-2 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible md:pb-0">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          const badge = item.badgeKey === "contacts" ? newContacts : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 shrink-0 items-center gap-3 rounded-2xl px-4 text-lg font-semibold transition-colors ${
                active ? "bg-brand-700 text-white" : "text-stone-800 hover:bg-stone-100"
              }`}
            >
              <span aria-hidden className="text-2xl">
                {item.icon}
              </span>
              <span className="whitespace-nowrap">{item.label}</span>
              {badge > 0 && (
                <span
                  className={`ml-auto rounded-full px-2.5 py-0.5 text-base font-bold ${
                    active ? "bg-white text-brand-700" : "bg-brand-600 text-white"
                  }`}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="hidden space-y-2 border-t border-stone-200 p-3 md:block">
        <Link href="/" target="_blank" className="flex min-h-12 items-center gap-3 rounded-2xl px-4 text-stone-700 hover:bg-stone-100">
          <span aria-hidden>🌐</span> {t.admin.nav.website}
        </Link>
        <form action={signOut}>
          <button type="submit" className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-stone-700 hover:bg-stone-100">
            <span aria-hidden>🚪</span> {t.common.signOut}
          </button>
        </form>
      </div>
    </aside>
  );
}
