import { requireStudent } from "@/lib/auth";
import { ProfileForm } from "@/components/dashboard/ProfileForm";

export default async function ProfilePage() {
  const { profile } = await requireStudent();
  return (
    <ProfileForm
      profile={{
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        objectives: profile.objectives,
        country: profile.country, timezone: profile.timezone,
      }}
    />
  );
}
