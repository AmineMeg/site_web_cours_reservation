import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/LoginForm";
import { t } from "@/lib/i18n";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/security");

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-accent-50 px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 inline-block text-lg font-medium text-stone-700 hover:text-brand-700">
          {t.login.backHome}
        </Link>
        <div className="card">
          <h1 className="text-3xl font-bold">{t.login.title}</h1>
          <p className="mb-8 mt-2 text-lg text-stone-600">{t.login.subtitle}</p>
          <LoginForm />
          <Link href="/auth/forgot-password" className="mt-6 inline-block font-semibold text-brand-700 underline">{t.login.forgot}</Link>
        </div>
      </div>
    </main>
  );
}
