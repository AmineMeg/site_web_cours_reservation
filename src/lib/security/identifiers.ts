import { createHmac } from "node:crypto";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function derivedKey(secret: string, purpose: string): Buffer {
  if (secret.length < 32) throw new Error("SECURITY_SECRET must contain at least 32 random characters");
  return createHmac("sha256", secret).update(purpose).digest();
}

/** Keyed hash used as the rate-limit counter key: raw emails/IPs are never stored. */
export function rateLimitKeyHash(secret: string, bucket: string, identifier: string): string {
  return createHmac("sha256", derivedKey(secret, "rate-limit:v1")).update(`${bucket}\n${identifier}`).digest("hex");
}

/** Short keyed pseudonym of an identifier for the audit trail (correlation without disclosure). */
export function auditIdentifierHash(secret: string, identifier: string): string {
  return createHmac("sha256", derivedKey(secret, "audit-identifier:v1")).update(identifier).digest("hex").slice(0, 32);
}