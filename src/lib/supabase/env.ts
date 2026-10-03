/**
 * Supabase project URL, reduced to its origin (https://xxxx.supabase.co).
 * Protects against a common copy/paste mistake such as ".../rest/v1/".
 */
export function supabaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!raw) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: "${raw}"`);
  }
}

export function supabaseAnonKey(): string {
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return key;
}
