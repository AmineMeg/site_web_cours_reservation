"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { t } from "@/lib/i18n";

const items = [
  { href: "/dashboard", icon: "📅", label: t.dashboard.nav.book },
  { href: "/dashboard/profile", icon: "👤", label: t.dashboard.nav.profile },
  { href: "/dashboard/contact", icon: "✉️", label: t.dashboard.nav.contact },
];

export function StudentNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2 overflow-x-auto">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-12 shrink-0 items-center gap-2 rounded-xl px-4 text-lg font-semibold ${
              active ? "bg-brand-700 text-white" : "text-stone-800 hover:bg-stone-100"
            }`}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
