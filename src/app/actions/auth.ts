"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchSecurityStatus } from "@/lib/auth";
import { verifyTurnstile } from "@/lib/turnstile";
import { limitLogin, resetLoginLimit } from "@/lib/security/rate-limit";
import { auditEmailHash, logSecurityEvent } from "@/lib/security/audit";
import { normalizeEmail } from "@/lib/security/identifiers";
import { EMAIL_REGEX } from "@/lib/utils";
import { securityText } from "@/lib/i18n/security";
import { t } from "@/lib/i18n";

export interface LoginState {
  message: string;
}

/**
 * Password step only. It never reads business data: once the password is
 * accepted the user is sent to /security, which requires the authenticator
 * step (AAL2) before any profile or lesson data can be read.
 */
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!EMAIL_REGEX.test(email) || email.length > 254 || !password || password.length > 1024) {
    return { message: t.login.error };
  }
  // Bot check before counting, so anonymous floods cannot lock real accounts out.
  if (!(await verifyTurnstile(formData, "login"))) return { message: t.login.error };
  if (!(await limitLogin(email))) return { message: securityText.tooManyAttempts };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    console.error("[login] Password sign-in rejected", error?.status, error?.code);
    await logSecurityEvent("login.failed", null, { identifier: auditEmailHash(email) });
    return { message: t.login.error };
  }
  await resetLoginLimit(email);

  let message: string | null = null;
  try {
    const status = await fetchSecurityStatus(supabase);
    if (status.accountState === "missing") message = t.login.noProfile;
    else if (status.accountState === "inactive") message = t.login.inactive;
    else if (!status.sessionOk) message = t.login.error;
  } catch {
    message = t.login.error;
  }
  if (message) {
    await supabase.rpc("security_end_current_session");
    await supabase.auth.signOut({ scope: "local" });
    return { message };
  }

  await logSecurityEvent("login.password_ok", data.user.id);
  redirect("/security");
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("security_end_current_session");
  if (error) console.error("[security] Could not end the session record", error.code);
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?reason=signed_out");
}