import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { authFlowSecret } from "@/lib/auth-links";
import { auditIdentifierHash, normalizeEmail } from "./identifiers";

/** Flat, non-secret facts only (field names, counts, flags, hashed identifiers). */
export type AuditDetails = Record<string, string | number | boolean | null | string[]>;

export interface SecurityEventInput {
  /** Lowercase dotted name matching ^[a-z][a-z0-9_.]{2,63}$, e.g. "invite.sent", "password.reset_completed". */
  event: string;
  /** Account the event is about (null for unknown accounts, e.g. a reset for an unknown email). */
  subjectId?: string | null;
  /** Account that performed the action (e.g. the teacher), recorded because service-role calls have no JWT user. */
  actorId?: string | null;
  /** Serialized size <= 2000 chars. */
  details?: AuditDetails;
}

/**
 * Appends a server-side event to the security audit trail (best effort: never
 * throws, failures are logged without data). Never pass passwords, tokens,
 * codes, IP addresses or raw emails (use auditEmailHash for correlation).
 */
export async function recordSecurityEvent({ event, subjectId = null, actorId = null, details = {} }: SecurityEventInput): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc("security_log_event", {
      p_event: event,
      p_subject: subjectId,
      p_details: details,
      p_actor: actorId,
    });
    if (error) console.error("[security] Audit write failed", error.code);
  } catch (error) {
    console.error("[security] Audit write failed", error instanceof Error ? error.name : "unknown");
  }
}

/** Shorthand used by the security module: the subject is also the actor. */
export async function logSecurityEvent(event: string, subjectId: string | null, details: AuditDetails = {}): Promise<void> {
  await recordSecurityEvent({ event, subjectId, actorId: subjectId, details });
}

/** Keyed pseudonym of an email so repeated failures can be correlated without storing it. */
export function auditEmailHash(email: string): string {
  return auditIdentifierHash(authFlowSecret(), normalizeEmail(email));
}