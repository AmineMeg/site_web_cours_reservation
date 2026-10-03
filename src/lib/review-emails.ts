import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendReviewInvitation } from "@/lib/notifications";
import { emailIsConfigured } from "@/lib/email";

type EmailRequest = { student_id: string; email: string; full_name: string; lease_token: string };

export async function sendDueReviewInvitations(supabase: SupabaseClient) {
  if (!emailIsConfigured()) {
    console.error("[reviews] Invitation delivery disabled: configure email provider");
    throw new Error("Review invitation email provider is not configured");
  }
  const { data, error } = await supabase.rpc("claim_review_emails");
  if (error) {
    console.error("[reviews] Email queue unavailable", error.code);
    throw new Error("Unable to claim review invitations");
  }
  const requests = (data ?? []) as EmailRequest[];
  let sent = 0, failed = 0;
  for (let offset = 0; offset < requests.length; offset += 2) {
    const started = Date.now();
    await Promise.all(requests.slice(offset, offset + 2).map(async (request) => {
      const result = await sendReviewInvitation({ id: request.student_id, email: request.email, name: request.full_name });
      const { error: finishError } = await supabase.rpc("finish_review_email", {
        p_student: request.student_id, p_lease: request.lease_token, p_sent: result.ok,
      });
      if (finishError) {
        console.error("[reviews] Invitation delivery state save failed", finishError.code);
        failed++;
      } else if (result.ok) sent++;
      else failed++;
    }));
    // Resend's default rate limit is two requests per second.
    if (offset + 2 < requests.length) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1100 - (Date.now() - started))));
    }
  }
  if (failed) console.error("[reviews] Invitation delivery failures", failed);
  return { claimed: requests.length, sent, failed };
}
