import "server-only";

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

/**
 * Email sending placeholder. Priority:
 *  1. RESEND_API_KEY set  -> sends through Resend (https://resend.com, free tier: 3,000 emails/month)
 *  2. EMAIL_WEBHOOK_URL   -> POSTs the payload as JSON (Zapier, Make, n8n, Supabase Edge Function…)
 *  3. otherwise           -> prints the email in the server logs (development)
 * Never throws: a failed email must not break the user's action.
 */
export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean }> {
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
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

    const webhook = process.env.EMAIL_WEBHOOK_URL;
    if (webhook) {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { ok: res.ok };
    }

    console.info(
      `\n[email placeholder] ------------------------------\nTo: ${payload.to}\nSubject: ${payload.subject}\n\n${payload.text}\n--------------------------------------------------\n`,
    );
    return { ok: true };
  } catch (error) {
    console.error("[email] failed", error);
    return { ok: false };
  }
}
