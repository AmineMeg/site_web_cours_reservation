import { requireTeacher, getSettings } from "@/lib/auth";
import { ContactCard } from "@/components/admin/ContactCard";
import { PageTitle } from "@/components/ui/Notice";
import { CONTACT_RETENTION_DAYS } from "@/lib/config";
import { formatDate } from "@/lib/dates";
import { t } from "@/lib/i18n";
import type { Contact, TrialBooking } from "@/lib/types";

export default async function ContactsPage() {
  const { supabase } = await requireTeacher();
  const settings = await getSettings(supabase);

  const now = Date.now();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .is("converted_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[admin] Contacts unavailable", error.code);
    throw new Error(t.common.error);
  }
  const contacts = (data ?? []) as Contact[];
  const { data: trialData, error: trialError } = await supabase.from("trial_bookings").select("*");
  if (trialError) {
    console.error("[admin] Trials unavailable", trialError.code);
    throw new Error(t.common.error);
  }
  const trials = (trialData ?? []) as TrialBooking[];

  return (
    <>
      <PageTitle title={t.admin.contacts.title} intro={t.admin.contacts.intro} />
      {contacts.length === 0 ? (
        <p className="card text-center text-xl text-stone-600">{t.admin.contacts.empty}</p>
      ) : (
        <ul className="space-y-6">
          {contacts.map((contact) => {
            const age = Math.floor((now - Date.parse(contact.created_at)) / 86400_000);
            return (
              <ContactCard
                key={contact.id}
                contact={contact}
                receivedLabel={formatDate(contact.created_at, settings.timezone)}
                daysLeft={Math.max(0, CONTACT_RETENTION_DAYS - age)}
                trial={trials.find((trial) => trial.contact_id === contact.id && trial.status === "booked") ?? null}
                hasTrialHistory={trials.some((trial) => trial.contact_id === contact.id)}
                timezone={settings.timezone}
                now={now}
              />
            );
          })}
        </ul>
      )}
    </>
  );
}
