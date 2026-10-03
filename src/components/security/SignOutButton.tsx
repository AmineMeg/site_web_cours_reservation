import { signOut } from "@/app/actions/auth";
import { securityText as s } from "@/lib/i18n/security";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button type="submit" className="font-semibold text-stone-600 underline">{s.signOut}</button>
    </form>
  );
}