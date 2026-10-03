import { requireTeacher, getSettings } from "@/lib/auth";
import { StudentList } from "@/components/admin/StudentList";
import { PageTitle } from "@/components/ui/Notice";
import { t } from "@/lib/i18n";
import type { Profile } from "@/lib/types";

export default async function StudentsPage() {
  const { supabase } = await requireTeacher();
  const settings = await getSettings(supabase);
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, credits, is_active")
    .eq("role", "student")
    .order("full_name");
  const students = (data ?? []) as Profile[];

  return (
    <>
      <PageTitle title={t.admin.students.title} intro={t.admin.students.intro} />
      {students.length === 0 ? (
        <p className="card text-center text-xl text-stone-600">{t.admin.students.empty}</p>
      ) : (
        <StudentList students={students} validityMonths={settings.credit_validity_months} />
      )}
    </>
  );
}
