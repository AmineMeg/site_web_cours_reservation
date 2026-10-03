import Link from "next/link";
import type { Metadata } from "next";
import { accountText as a } from "@/lib/i18n/account";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-12">
      <div className="w-full max-w-lg">
        <Link href="/login" className="mb-6 inline-block text-lg font-semibold text-brand-700">{a.backLogin}</Link>
        <div className="card space-y-6">{children}</div>
      </div>
    </main>
  );
}
