import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { authFlowSecret } from "@/lib/auth-links";
import { normalizeEmail, rateLimitKeyHash } from "./identifiers";
import { ipRateLimitKey, trustedClientIp } from "./client-ip";

interface Rule {
  bucket: string;
  max: number;
  windowSeconds: number;
}

/** Persistent limits shared by every server instance (fixed windows in Postgres). */
export const RATE_LIMITS = {
  loginEmail: { bucket: "login:email", max: 5, windowSeconds: 15 * 60 },
  loginIp: { bucket: "login:ip", max: 30, windowSeconds: 15 * 60 },
  mfaUser: { bucket: "mfa:user", max: 8, windowSeconds: 15 * 60 },
  mfaIp: { bucket: "mfa:ip", max: 30, windowSeconds: 15 * 60 },
  recoveryUser: { bucket: "recovery:user", max: 5, windowSeconds: 60 * 60 },
  recoveryIp: { bucket: "recovery:ip", max: 10, windowSeconds: 60 * 60 },
  resetEmail: { bucket: "reset:email", max: 3, windowSeconds: 60 * 60 },
  resetIp: { bucket: "reset:ip", max: 10, windowSeconds: 60 * 60 },
  passwordCheckUser: { bucket: "password-check:user", max: 5, windowSeconds: 15 * 60 },
  enrollUser: { bucket: "enroll:user", max: 10, windowSeconds: 60 * 60 },
  accountLinkIp: { bucket: "account-link:ip", max: 20, windowSeconds: 15 * 60 },
} as const satisfies Record<string, Rule>;

async function requestIpKey(): Promise<string | null> {
  const ip = trustedClientIp(await headers());
  return ip ? ipRateLimitKey(ip) : null;
}

/** Counts one attempt; fails closed (false) when the limiter is unavailable. */
async function hit(rule: Rule, identifier: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .rpc("security_rate_limit_hit", {
        p_bucket: rule.bucket,
        p_key_hash: rateLimitKeyHash(authFlowSecret(), rule.bucket, identifier),
        p_max_attempts: rule.max,
        p_window_seconds: rule.windowSeconds,
      })
      .single<{ allowed: boolean; retry_after_seconds: number }>();
    if (error || !data) {
      console.error("[security] Rate limiter unavailable", error?.code);
      return false;
    }
    return data.allowed === true;
  } catch (error) {
    console.error("[security] Rate limiter failed", error instanceof Error ? error.name : "unknown");
    return false;
  }
}

export type RateLimitScope = keyof typeof RATE_LIMITS;

/** Rate-limit key for the caller's IP from the trusted deployment header, or null when unavailable. */
export async function clientIpRateLimitKey(): Promise<string | null> {
  return requestIpKey();
}

/**
 * Counts one attempt for `identifier` in `scope` (persistent, shared by all
 * instances; only an HMAC of the identifier is stored). `limit` /
 * `windowSeconds` override the scope defaults from RATE_LIMITS. Emails are
 * normalized; pass `await clientIpRateLimitKey()` for IP scopes (a null
 * identifier is skipped and returns true). Returns true when allowed;
 * false when over the limit OR when the limiter is unavailable (fail closed).
 */
export async function consumeRateLimit(
  scope: RateLimitScope,
  identifier: string | null,
  limit?: number,
  windowSeconds?: number,
): Promise<boolean> {
  const defaults: Rule | undefined = RATE_LIMITS[scope];
  if (!defaults) return false;
  if (identifier === null) return true;
  const rule: Rule = {
    bucket: defaults.bucket,
    max: limit ?? defaults.max,
    windowSeconds: windowSeconds ?? defaults.windowSeconds,
  };
  if (!Number.isInteger(rule.max) || rule.max < 1 || rule.max > 10000
    || !Number.isInteger(rule.windowSeconds) || rule.windowSeconds < 1 || rule.windowSeconds > 86400) {
    return false;
  }
  const value = identifier.includes("@") ? normalizeEmail(identifier) : identifier.trim();
  if (!value || value.length > 320) return false;
  return hit(rule, value);
}
/** Every bucket is counted (no short-circuit) so parallel guesses cannot skip one. */
async function limit(checks: Array<[Rule, string | null]>): Promise<boolean> {
  let allowed = true;
  for (const [rule, identifier] of checks) {
    if (identifier && !(await hit(rule, identifier))) allowed = false;
  }
  return allowed;
}

/** True when this login attempt for `email` is allowed. */
export async function limitLogin(email: string): Promise<boolean> {
  return limit([[RATE_LIMITS.loginEmail, normalizeEmail(email)], [RATE_LIMITS.loginIp, await requestIpKey()]]);
}

/** After a successful password sign-in: clears the per-account login counter. */
export async function resetLoginLimit(email: string): Promise<void> {
  try {
    const bucket = RATE_LIMITS.loginEmail.bucket;
    const { error } = await createAdminClient().rpc("security_rate_limit_reset", {
      p_bucket: bucket,
      p_key_hash: rateLimitKeyHash(authFlowSecret(), bucket, normalizeEmail(email)),
    });
    if (error) console.error("[security] Rate limit reset failed", error.code);
  } catch (error) {
    console.error("[security] Rate limit reset failed", error instanceof Error ? error.name : "unknown");
  }
}

/** True when an authenticator-code attempt (sign-in, step-up or setup) is allowed. */
export async function limitMfa(userId: string): Promise<boolean> {
  return limit([[RATE_LIMITS.mfaUser, userId], [RATE_LIMITS.mfaIp, await requestIpKey()]]);
}

/** True when a recovery-code attempt is allowed. */
export async function limitRecovery(userId: string): Promise<boolean> {
  return limit([[RATE_LIMITS.recoveryUser, userId], [RATE_LIMITS.recoveryIp, await requestIpKey()]]);
}

/** True when a password-reset email may be requested for `email`. */
export async function limitPasswordReset(email: string): Promise<boolean> {
  return limit([[RATE_LIMITS.resetEmail, normalizeEmail(email)], [RATE_LIMITS.resetIp, await requestIpKey()]]);
}

/** True when a signed-in user may submit their current password again (sensitive changes). */
export async function limitSensitivePasswordCheck(userId: string): Promise<boolean> {
  return limit([[RATE_LIMITS.passwordCheckUser, userId]]);
}

/** True when a new authenticator enrollment may be started. */
export async function limitEnrollment(userId: string): Promise<boolean> {
  return limit([[RATE_LIMITS.enrollUser, userId]]);
}

/**
 * True when this IP may submit another invitation/recovery link (verifyOtp).
 * Per trusted client IP only; when no trusted IP header is configured the
 * check is skipped (Supabase's own token endpoint limits still apply).
 */
export async function limitAccountLinkVerification(): Promise<boolean> {
  return limit([[RATE_LIMITS.accountLinkIp, await requestIpKey()]]);
}