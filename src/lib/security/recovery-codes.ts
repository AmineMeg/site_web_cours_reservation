import { createHash, randomInt } from "node:crypto";

/** Number of one-use recovery codes issued at a time (the database accepts 8-16). */
export const RECOVERY_CODE_COUNT = 10;

// Crockford base32: no I, L, O or U, so codes are easy to read and type.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
// 26 symbols x 5 bits = 130 bits of entropy per code.
const CODE_SYMBOLS = 26;
const GROUPS = [5, 5, 5, 5, 6];
const NORMALIZED = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function formatCode(raw: string): string {
  const parts: string[] = [];
  let offset = 0;
  for (const size of GROUPS) {
    parts.push(raw.slice(offset, offset + size));
    offset += size;
  }
  return parts.join("-");
}

/** Cryptographically random, distinct codes formatted as XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    let raw = "";
    for (let i = 0; i < CODE_SYMBOLS; i += 1) raw += ALPHABET[randomInt(ALPHABET.length)];
    codes.add(formatCode(raw));
  }
  return [...codes];
}

/** Canonical form of a typed code (case, spaces, dashes and look-alike letters ignored), or null. */
export function normalizeRecoveryCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 64) return null;
  const value = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return NORMALIZED.test(value) ? value : null;
}

/** SHA-256 bound to the account; only this hash is ever stored. */
export function hashRecoveryCode(userId: string, normalizedCode: string): string {
  return createHash("sha256").update(`mfa-recovery:v1:${userId}:${normalizedCode}`).digest("hex");
}