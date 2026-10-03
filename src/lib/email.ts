import "server-only";

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() || process.env.EMAIL_WEBHOOK_URL?.trim());
}

/**
 * Email sending placeholder. Priority:
 *  1. RESEND_API_KEY set  -> sends through Resend (https://resend.com, free tier: 3,000 emails/month)
 *  2. EMAIL_WEBHOOK_URL   -> POSTs the payload as JSON (Zapier, Make, n8n, Supabase Edge Function…)
 *  3. otherwise           -> reports a delivery failure, without logging email contents
 * Returns a delivery result so callers can distinguish saved data from sent emails.
 */
export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean }> {
  try {
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || "onboarding@resend.dev",
          to: [payload.to],
          subject: payload.subject,
          text: payload.text,
          reply_to: payload.replyTo,
        }),
      });
      if (!res.ok) console.error("[email] Resend error", res.status, await res.text());
      return { ok: res.ok };
    }

    const webhook = process.env.EMAIL_WEBHOOK_URL?.trim();
    if (webhook) {
      const res = await fetch(webhook, {
        method: "POST",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) console.error("[email] Webhook delivery failed", res.status);
      return { ok: res.ok };
    }

    console.error("[email] Delivery disabled: configure RESEND_API_KEY or EMAIL_WEBHOOK_URL");
    return { ok: false };
  } catch (error) {
    console.error("[email] failed", error);
    return { ok: false };
  }
}
