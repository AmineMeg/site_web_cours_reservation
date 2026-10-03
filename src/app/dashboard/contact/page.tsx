import { requireStudent } from "@/lib/auth";
import { MessageForm } from "@/components/dashboard/MessageForm";
import { siteConfig } from "@/lib/config";
import { t } from "@/lib/i18n";

export default async function ContactTeacherPage() {
  await requireStudent();
  const c = t.dashboard.contact;

  return (
    <div className="space-y-8">
      <section className="card">
        <h1 className="text-3xl font-bold">{c.title}</h1>
        <p className="mt-4 text-lg text-stone-600">{c.emailLabel}</p>
        <a href={`mailto:${siteConfig.teacherEmail}`} className="break-all text-2xl font-bold text-brand-700 underline">
          📧 {siteConfig.teacherEmail}
        </a>
      </section>
      <section className="card">
        <h2 className="mb-4 text-2xl font-bold">{c.formTitle}</h2>
        <MessageForm />
      </section>
    </div>
  );
}
