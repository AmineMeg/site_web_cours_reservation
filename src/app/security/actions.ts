"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  requireAuthenticatedUser,
  requireMfa,
  requireRecentAuthentication,
  type AuthenticatedContext,
} from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountSiteUrl } from "@/lib/auth-links";
import { verifyCurrentPassword } from "@/lib/verify-password";
import { limitEnrollment, limitMfa, limitRecovery } from "@/lib/security/rate-limit";
import { logSecurityEvent } from "@/lib/security/audit";
import { sendSecurityAlert } from "@/lib/security/alerts";
import { currentSessionId, endLocalSession } from "@/lib/security/session";
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from "@/lib/security/recovery-codes";
import { normalizeTotpCode, totpQrDataUrl } from "@/lib/security/totp-input";
import { safeNextPath } from "@/lib/security/redirects";
import { securityText as s } from "@/lib/i18n/security";
import type { ActionResult } from "@/lib/types";

const REPLACE_PATH = "/security/setup?replace=1";

export interface EnrollmentStart {
  ok: boolean;
  message: string;
  factorId?: string;
  qrCode?: string | null;
  secret?: string;
}

export interface EnrollmentResult {
  ok: boolean;
  message: string;
  /** Plain recovery codes: returned exactly once, never stored. */
  codes?: string[];
}

export interface CodeFormState {
  message: string;
}

async function enrollmentContext(replace: boolean): Promise<AuthenticatedContext | null> {
  const context = await requireAuthenticatedUser();
  if (!context.status.requiresMfa) redirect("/security/settings");
  if (replace) return requireRecentAuthentication({ next: REPLACE_PATH });
  return context.status.hasVerifiedFactor ? null : context;
}

async function listTotpFactors(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error("Unable to list authenticator factors");
  return data.all.filter((factor) => factor.factor_type === "totp");
}

/** Generates new recovery codes and stores only their hashes. Returns null when storing failed. */
async function issueRecoveryCodes(userId: string): Promise<string[] | null> {
  const codes = generateRecoveryCodes();
  const hashes = codes.map((code) => hashRecoveryCode(userId, normalizeRecoveryCode(code)!));
  const { error } = await createAdminClient().rpc("security_store_recovery_codes", {
    p_user_id: userId,
    p_hashes: hashes,
  });
  if (error) {
    console.error("[security] Recovery codes not stored", error.code);
    return null;
  }
  return codes;
}

/** Step 1 of setup: creates an unverified TOTP factor (stale unverified ones are removed first). */
export async function startTotpEnrollment(replace: boolean): Promise<EnrollmentStart> {
  const context = await enrollmentContext(replace === true);
  if (!context) return { ok: false, message: s.alreadyEnrolled };
  const { supabase, user } = context;
  if (!(await limitEnrollment(user.id))) return { ok: false, message: s.tooManyAttempts };

  try {
    for (const factor of await listTotpFactors(supabase)) {
      if (factor.status !== "verified") {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (error) console.error("[security] Stale factor cleanup failed", error.code);
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${Date.now()}`,
      issuer: accountSiteUrl().hostname,
    });
    if (error || !data) {
      console.error("[security] TOTP enrollment failed", error?.code);
      return { ok: false, message: s.error };
    }
    return {
      ok: true,
      message: "",
      factorId: data.id,
      qrCode: totpQrDataUrl(data.totp.qr_code),
      secret: data.totp.secret,
    };
  } catch (error) {
    console.error("[security] TOTP enrollment failed", error instanceof Error ? error.message : "unknown");
    return { ok: false, message: s.error };
  }
}

/** Step 2 of setup: verifies the first code (session becomes AAL2) and issues recovery codes. */
export async function confirmTotpEnrollment(factorId: string, code: string, replace: boolean): Promise<EnrollmentResult> {
  const isReplace = replace === true;
  const context = await enrollmentContext(isReplace);
  if (!context) return { ok: false, message: s.alreadyEnrolled };
  const { supabase, user } = context;

  const totp = normalizeTotpCode(code);
  if (!totp || typeof factorId !== "string") return { ok: false, message: s.invalidCode };
  if (!(await limitMfa(user.id))) return { ok: false, message: s.tooManyAttempts };

  let previous: string[];
  try {
    const factors = await listTotpFactors(supabase);
    const pending = factors.find((factor) => factor.id === factorId && factor.status !== "verified");
    if (!pending) return { ok: false, message: s.setupExpired };
    previous = factors.filter((factor) => factor.status === "verified").map((factor) => factor.id);
  } catch {
    return { ok: false, message: s.error };
  }

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: totp });
  if (verifyError) {
    await logSecurityEvent("mfa.verify_failed", user.id, { step: "enroll" });
    return { ok: false, message: s.invalidCode };
  }

  if (isReplace) {
    for (const id of previous) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) console.error("[security] Previous factor not removed", error.code);
    }
    const sid = await currentSessionId(supabase);
    const { error: revokeError } = await createAdminClient().rpc("revoke_user_sessions", {
      p_user_id: user.id,
      p_except_session: sid,
    });
    if (revokeError) console.error("[security] Other sessions not revoked", revokeError.code);
    const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
    if (othersError) console.error("[security] Other sessions sign-out failed", othersError.code);
  }

  await logSecurityEvent(isReplace ? "mfa.factor_replaced" : "mfa.enrolled", user.id);
  await sendSecurityAlert(user.email, isReplace ? "mfa_replaced" : "mfa_enrolled");

  const codes = await issueRecoveryCodes(user.id);
  if (!codes) return { ok: true, message: s.codesStoreFailed };
  return { ok: true, message: "", codes };
}

/** Replaces every recovery code (requires a fresh authenticator code). */
export async function regenerateRecoveryCodes(): Promise<EnrollmentResult> {
  const { user, status } = await requireRecentAuthentication({ next: "/security/settings" });
  if (!status.requiresMfa) return { ok: false, message: s.error };
  const codes = await issueRecoveryCodes(user.id);
  if (!codes) return { ok: false, message: s.error };
  await sendSecurityAlert(user.email, "codes_regenerated");
  return { ok: true, message: "", codes };
}

/** Sign-in second step ("verify") or step-up for sensitive changes ("reauth"). */
export async function verifyTotpCode(_prev: CodeFormState, formData: FormData): Promise<CodeFormState> {
  const mode = formData.get("mode") === "reauth" ? "reauth" : "verify";
  const next = safeNextPath(formData.get("next"));
  const { supabase, user, status } =
    mode === "reauth" ? await requireMfa() : await requireAuthenticatedUser();
  if (!status.requiresMfa) redirect("/security/settings");
  if (!status.hasVerifiedFactor) redirect("/security/setup");

  const code = normalizeTotpCode(formData.get("code"));
  if (!code) return { message: s.invalidCode };
  if (!(await limitMfa(user.id))) return { message: s.tooManyAttempts };

  let verified = false;
  try {
    for (const factor of await listTotpFactors(supabase)) {
      if (factor.status !== "verified") continue;
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (!error) {
        verified = true;
        break;
      }
    }
  } catch {
    return { message: s.error };
  }
  if (!verified) {
    await logSecurityEvent("mfa.verify_failed", user.id, { step: mode });
    return { message: s.invalidCode };
  }

  await logSecurityEvent(mode === "reauth" ? "reauth.succeeded" : "mfa.verified", user.id);
  if (mode === "reauth") redirect(next ?? "/security/settings");
  redirect(next ? `/security?next=${encodeURIComponent(next)}` : "/security");
}

/**
 * Lost authenticator: password + one recovery code. Never grants AAL2: the
 * factors are deleted, every session is revoked and the user gets a fresh
 * AAL1 session that can only enroll a new authenticator.
 */
export async function recoverWithCode(_prev: CodeFormState, formData: FormData): Promise<CodeFormState> {
  const { supabase, user, status } = await requireAuthenticatedUser();
  if (!status.requiresMfa) redirect("/security/settings");
  if (!status.hasVerifiedFactor) redirect("/security/setup");
  if (status.aal === "aal2") redirect("/security/settings");
  if (!user.email) return { message: s.error };

  if (!(await limitRecovery(user.id))) return { message: s.tooManyAttempts };
  const password = String(formData.get("password") ?? "");
  const code = normalizeRecoveryCode(formData.get("code"));
  if (!password || password.length > 1024 || !code) return { message: s.recoverFailed };

  if (!(await verifyCurrentPassword(user.email, password, user.id))) {
    await logSecurityEvent("mfa.recovery_password_rejected", user.id);
    return { message: s.recoverFailed };
  }

  const admin = createAdminClient();
  const { data: consumed, error: consumeError } = await admin.rpc("security_consume_recovery_code", {
    p_user_id: user.id,
    p_hash: hashRecoveryCode(user.id, code),
  });
  if (consumeError) {
    console.error("[security] Recovery code check failed", consumeError.code);
    return { message: s.error };
  }
  if (consumed !== true) return { message: s.recoverFailed };

  const { data: factorList, error: listError } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  if (listError || !factorList) {
    console.error("[security] Factor listing failed during recovery", listError?.code);
    return { message: s.error };
  }
  for (const factor of factorList.factors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id });
    if (error) {
      console.error("[security] Factor deletion failed during recovery", error.code);
      return { message: s.error };
    }
  }
  const { error: finishError } = await admin.rpc("security_finish_mfa_recovery", {
    p_user_id: user.id,
    p_method: "recovery",
  });
  if (finishError) {
    console.error("[security] Recovery could not be completed", finishError.code);
    return { message: s.error };
  }

  await sendSecurityAlert(user.email, "recovery_used");
  await endLocalSession(supabase);
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (signInError) redirect("/login?reason=mfa_reset");
  redirect("/security/setup");
}

/** Ends every other session of the account; this one stays signed in. */
export async function signOutOtherDevices(): Promise<ActionResult> {
  const { supabase, user } = await requireMfa();
  const sid = await currentSessionId(supabase);
  if (!sid) return { ok: false, message: s.error };
  const { error } = await createAdminClient().rpc("revoke_user_sessions", {
    p_user_id: user.id,
    p_except_session: sid,
  });
  if (error) {
    console.error("[security] Other sessions not revoked", error.code);
    return { ok: false, message: s.error };
  }
  const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
  if (othersError) console.error("[security] Other sessions sign-out failed", othersError.code);
  return { ok: true, message: s.signedOutOthers };
}

/** Ends every session of the account, including this one. */
export async function signOutEverywhere(): Promise<ActionResult> {
  const { supabase, user } = await requireMfa();
  const { error } = await createAdminClient().rpc("revoke_user_sessions", { p_user_id: user.id });
  if (error) {
    console.error("[security] Sessions not revoked", error.code);
    return { ok: false, message: s.error };
  }
  await sendSecurityAlert(user.email, "signed_out_everywhere");
  await endLocalSession(supabase);
  redirect("/login?reason=signed_out_everywhere");
}