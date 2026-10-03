import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { nextFromReferer, safeNextPath } from "@/lib/security/redirects";
import type { AppSettings, Profile } from "@/lib/types";

export type SessionStatusReason =
  | "ok"
  | "revoked"
  | "signed_out"
  | "idle_timeout"
  | "absolute_timeout"
  | "account_inactive"
  | "account_missing";

/** Security state of the current session, computed by the database (public.security_session_status). */
export interface SecurityStatus {
  requiresMfa: boolean;
  sessionOk: boolean;
  reason: SessionStatusReason;
  aal: "aal1" | "aal2";
  hasVerifiedFactor: boolean;
  accountState: "active" | "inactive" | "missing";
  lastTotpAt: string | null;
  recentAuthUntil: string | null;
  idleExpiresAt: string | null;
  absoluteExpiresAt: string | null;
}

export interface AuthenticatedContext {
  supabase: SupabaseClient;
  user: User;
  status: SecurityStatus;
}

interface StatusRow {
  session_ok: boolean;
  reason: SessionStatusReason;
  aal: string;
  has_verified_factor: boolean;
  account_state: SecurityStatus["accountState"];
  last_totp_at: string | null;
  recent_auth_until: string | null;
  idle_expires_at: string | null;
  absolute_expires_at: string | null;
}

/** Reads (and refreshes) the database view of the current session. Throws when unavailable (fail closed). */
export async function fetchSecurityStatus(supabase: SupabaseClient): Promise<SecurityStatus> {
  const { data, error } = await supabase.rpc("security_session_status").single<StatusRow>();
  if (error || !data) {
    console.error("[security] Session status unavailable", error?.code);
    throw new Error("Unable to verify the session");
  }
  const { data: requiresMfa, error: roleError } = await supabase.rpc("security_requires_mfa");
  if (roleError || typeof requiresMfa !== "boolean") {
    console.error("[security] Account policy unavailable", roleError?.code);
    throw new Error("Unable to verify account policy. Run student-password-login.sql.");
  }
  return {
    requiresMfa,
    sessionOk: data.session_ok === true,
    reason: data.reason,
    aal: data.aal === "aal2" ? "aal2" : "aal1",
    hasVerifiedFactor: data.has_verified_factor === true,
    accountState: data.account_state,
    lastTotpAt: data.last_totp_at,
    recentAuthUntil: data.recent_auth_until,
    idleExpiresAt: data.idle_expires_at,
    absoluteExpiresAt: data.absolute_expires_at,
  };
}

/** One verified user + session status per request. No profile/business data is read here. */
const loadAuthContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, status: null };
  return { supabase, user, status: await fetchSecurityStatus(supabase) };
});

/**
 * Contract: a signed-in user whose session is live (not revoked, not idle /
 * absolutely expired) and whose account is active. ANY assurance level
 * (AAL1 included): use only for the MFA setup/verify/recovery screens.
 * Never read business data after this alone (RLS would deny it anyway).
 * Redirects: no user → /login; dead session → /security/session-ended.
 */
export async function requireAuthenticatedUser(): Promise<AuthenticatedContext> {
  const { supabase, user, status } = await loadAuthContext();
  if (!user || !status) redirect("/login");
  if (!status.sessionOk) redirect(`/security/session-ended?reason=${encodeURIComponent(status.reason)}`);
  return { supabase, user, status };
}

/**
 * Contract: requireAuthenticatedUser() + a verified TOTP factor + an AAL2
 * session. This is the minimum for any page/action touching account data.
 * Redirects: no factor → /security/setup; AAL1 → /security/verify.
 */
export async function requireMfa(): Promise<AuthenticatedContext> {
  const context = await requireAuthenticatedUser();
  if (!context.status.requiresMfa) return context;
  if (!context.status.hasVerifiedFactor) redirect("/security/setup");
  if (context.status.aal !== "aal2") redirect("/security/verify");
  return context;
}

/**
 * True when the current session passes the MFA gate AND its last TOTP
 * verification (the signed JWT `amr` claim, checked by the database) is
 * recent: default window from public.security_settings (10 min);
 * `maxAgeSeconds` can only make it stricter.
 */
export async function hasRecentAuthentication(maxAgeSeconds?: number): Promise<boolean> {
  const { supabase } = await requireMfa();
  const { data, error } = await supabase.rpc("security_has_recent_auth", {
    p_max_age_seconds: maxAgeSeconds ?? null,
  });
  if (error) {
    console.error("[security] Recent authentication check failed", error.code);
    return false;
  }
  return data === true;
}

/**
 * Contract: requireMfa() + a fresh authenticator code (see hasRecentAuthentication).
 * Call FIRST in server actions/pages performing sensitive changes. Otherwise
 * redirects to /security/reauth, which then returns to `next` (default: the
 * same-origin page that submitted the action, else /security/settings) so
 * the user can submit again.
 */
export async function requireRecentAuthentication(
  options: { next?: string; maxAgeSeconds?: number } = {},
): Promise<AuthenticatedContext> {
  const context = await requireMfa();
  // Student sensitive changes confirm the current password in their action.
  if (!context.status.requiresMfa) return context;
  if (!(await hasRecentAuthentication(options.maxAgeSeconds))) {
    const requestHeaders = await headers();
    const next =
      safeNextPath(options.next) ??
      nextFromReferer(requestHeaders.get("referer"), requestHeaders.get("host")) ??
      "/security/settings";
    redirect(`/security/reauth?next=${encodeURIComponent(next)}`);
  }
  return context;
}

/**
 * Current user + profile (cached per request). The profile is only read once
 * the session passes the MFA gate; otherwise `profile` is null. Never redirects.
 */
export const getCurrentProfile = cache(async () => {
  const { supabase, user, status } = await loadAuthContext();
  if (!user || !status?.sessionOk || (status.requiresMfa && (!status.hasVerifiedFactor || status.aal !== "aal2"))) {
    return { supabase, profile: null as Profile | null };
  }
  const { error: balanceError } = await supabase.rpc("refresh_credit_balances");
  if (balanceError) {
    console.error("[credits] Balance refresh failed", balanceError.code);
    throw new Error("Unable to load credit balances. Run trial-and-credit-rules.sql.");
  }
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { supabase, profile: (data as Profile | null) ?? null };
});

async function requireProfile() {
  await requireMfa();
  const { supabase, profile } = await getCurrentProfile();
  if (!profile) redirect("/security");
  return { supabase, profile };
}

export async function requireTeacher() {
  const { supabase, profile } = await requireProfile();
  if (profile.role !== "teacher") redirect("/dashboard");
  return { supabase, profile };
}

export async function requireStudent() {
  const { supabase, profile } = await requireProfile();
  if (profile.role === "teacher") redirect("/admin");
  if (!profile.is_active) redirect("/security/session-ended?reason=account_inactive");
  return { supabase, profile };
}

export async function getSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("timezone, lesson_minutes, booking_window_days, min_notice_hours, credit_validity_months")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) {
    console.error("[settings] Settings unavailable", error?.code);
    throw new Error("Unable to load lesson settings. Run trial-and-credit-rules.sql.");
  }
  return data as AppSettings;
}