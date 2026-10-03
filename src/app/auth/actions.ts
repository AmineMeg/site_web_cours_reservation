"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAccountLink } from "@/lib/auth-links";
import { PASSWORD_FLOW_COOKIE, markPasswordFlow, requirePasswordFlow } from "@/lib/password-flow";
import { passwordProblem } from "@/lib/password-policy";
import { sendPasswordReset } from "@/lib/notifications";
import { emailIsConfigured } from "@/lib/email";
import { requireRecentAuthentication } from "@/lib/auth";
import { verifyCurrentPassword } from "@/lib/verify-password";
import { verifyTurnstile } from "@/lib/turnstile";
import { limitAccountLinkVerification } from "@/lib/security/rate-limit";
import { logSecurityEvent } from "@/lib/security/audit";
import { accountText as a } from "@/lib/i18n/account";
import { EMAIL_REGEX, field } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

export async function confirmAccountLink(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const tokenHash = field(formData, "token_hash");
  const type = field(formData, "type");
  if (!/^[a-f0-9]{64}$/i.test(tokenHash) || (type !== "invite" && type !== "recovery")) {
    return { ok: false, message: a.invalidLink };
  }
  if (!await limitAccountLinkVerification()) return { ok: false, message: a.error };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    console.error("[auth-link] Verification failed", error.status, error.code);
    return { ok: false, message: a.invalidLink };
  }
  await markPasswordFlow();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && type === "invite") await logSecurityEvent("invite.accepted", user.id);
  redirect("/auth/set-password");
}

export async function requestPasswordReset(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const email = field(formData, "email").toLowerCase();
  if (!EMAIL_REGEX.test(email) || email.length > 254) return { ok: false, message: a.error };
  if (!emailIsConfigured()) return { ok: false, message: a.emailUnavailable };
  // Rate-limit helper is shared with login/MFA; all instances use the same database.
  const { limitPasswordReset } = await import("@/lib/security/rate-limit");
  if (!await limitPasswordReset(email)) return { ok: true, message: a.resetRequested };
  if (!await verifyTurnstile(formData, "reset")) return { ok: false, message: a.challengeFailed };
  const link = await createAccountLink(email, "recovery");
  if (link) {
    const result = await sendPasswordReset({ name: "", email, url: link.url });
    if (!result.ok) console.error("[auth-link] Reset email delivery failed");
    else await logSecurityEvent("password.reset_requested", link.user.id);
  }
  // Never disclose whether an address belongs to an account.
  return { ok: true, message: a.resetRequested };
}

export async function setAccountPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requirePasswordFlow();
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password, String(formData.get("confirm") ?? ""));
  if (problem) {
    return { ok: false, message: problem === "short" ? a.passwordShort : problem === "long" ? a.passwordLong : a.passwordMismatch };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[auth-link] Password update failed", error.status, error.code);
    return { ok: false, message: a.error };
  }
  // Expire pre-existing application sessions immediately, not just their refresh tokens.
  const { error: revokeError } = await createAdminClient().rpc("revoke_user_sessions", { p_user_id: user.id });
  if (revokeError) {
    console.error("[auth-link] Session revocation failed", revokeError.code);
    return { ok: false, message: a.error };
  }
  await logSecurityEvent("password.reset_completed", user.id);
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) {
    console.error("[auth-link] Global sign out failed", signOutError.code);
    return { ok: false, message: a.error };
  }
  (await cookies()).delete(PASSWORD_FLOW_COOKIE);
  redirect("/login?password=updated");
}

export async function changeAccountPassword(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireRecentAuthentication();
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email) return { ok: false, message: a.error };
  const { limitSensitivePasswordCheck } = await import("@/lib/security/rate-limit");
  if (!await limitSensitivePasswordCheck(user.id)) return { ok: false, message: a.error };
  const password = String(formData.get("password") ?? "");
  const problem = passwordProblem(password, String(formData.get("confirm") ?? ""));
  if (problem) {
    return { ok: false, message: problem === "short" ? a.passwordShort : problem === "long" ? a.passwordLong : a.passwordMismatch };
  }
  if (!await verifyCurrentPassword(user.email, String(formData.get("current_password") ?? ""), user.id)) {
    return { ok: false, message: a.wrongCurrentPassword };
  }
  const { error } = await supabase.auth.updateUser({
    password,
    current_password: String(formData.get("current_password") ?? ""),
  });
  if (error) {
    console.error("[security] Password change failed", error.code);
    return { ok: false, message: a.error };
  }
  const { error: revokeError } = await createAdminClient().rpc("revoke_user_sessions", { p_user_id: user.id });
  if (revokeError) {
    console.error("[security] Session revocation failed", revokeError.code);
    return { ok: false, message: a.error };
  }
  await logSecurityEvent("password.changed", user.id);
  const { error: logoutError } = await supabase.auth.signOut({ scope: "global" });
  if (logoutError) {
    console.error("[security] Global logout failed", logoutError.code);
    return { ok: false, message: a.error };
  }
  (await cookies()).delete(PASSWORD_FLOW_COOKIE);
  redirect("/login?password=updated");
}
