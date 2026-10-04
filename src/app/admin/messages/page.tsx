import { requireTeacher, getSettings } from "@/lib/auth";
import { PageTitle } from "@/components/ui/Notice";
import { buttonClass } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import { t } from "@/lib/i18n";
import { DeleteMessageButton } from "@/components/admin/DeleteMessageButton";

interface MessageRow {
  id: string;
  body: string;
  created_at: string;
  student: { full_name: string; email: string; phone: string } | null;
}

export default async function MessagesPage() {
  const { supabase } = await requireTeacher();
  const settings = await getSettings(supabase);
  const { data, error } = await supabase
    .from("messages")
    .select("id, body, created_at, student:profiles(full_name, email, phone)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[admin] Messages unavailable", error.code);
    throw new Error(t.common.error);
  }
  const messages = (data ?? []) as unknown as MessageRow[];
  const m = t.admin.messages;

  return (
    <>
      <PageTitle title={m.title} />
      {messages.length === 0 ? (
        <p className="card text-center text-xl text-stone-600">{m.empty}</p>
      ) : (
        <ul className="space-y-4">
          {messages.map((msg) => (
            <li key={msg.id} className="card space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xl font-bold">{m.from(msg.student?.full_name || msg.student?.email || "—")}</p>
                <p className="text-stone-500">{formatDateTime(msg.created_at, settings.timezone)}</p>
              </div>
              <p className="whitespace-pre-line rounded-xl bg-stone-50 p-4 text-lg">{msg.body}</p>
              {msg.student?.email && (
                <a href={`mailto:${msg.student.email}`} className={buttonClass("secondary", "md")}>
                  ↩️ {m.reply}
                </a>
              )}
              <DeleteMessageButton id={msg.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
