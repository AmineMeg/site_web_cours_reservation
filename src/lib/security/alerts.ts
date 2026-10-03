import "server-only";
import { sendEmail } from "@/lib/email";
import { securityText as s } from "@/lib/i18n/security";

export type SecurityAlert = keyof typeof s.alerts;

/** Best-effort notification to the account owner after a security-relevant change. */
export async function sendSecurityAlert(email: string | undefined, alert: SecurityAlert): Promise<void> {
  if (!email) return;
  try {
    const result = await sendEmail({ to: email, subject: s.alertSubject, text: s.alertBody(s.alerts[alert]) });
    if (!result.ok) console.error("[security] Security alert not delivered", alert);
  } catch {
    console.error("[security] Security alert failed", alert);
  }
}