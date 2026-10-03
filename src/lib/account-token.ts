// Supabase Auth uses SHA-224 token hashes; accept SHA-256 for existing links too.
export function validAccountToken(value: unknown): value is string {
  return typeof value === "string" && /^(?:[a-f0-9]{56}|[a-f0-9]{64})$/i.test(value);
}
