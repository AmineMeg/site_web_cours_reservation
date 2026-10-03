/**
 * Supabase project URL, reduced to its origin (https://xxxx.supabase.co).
 * Protects against a common copy/paste mistake such as ".../rest/v1/".
 */
export function supabaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!raw) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: "${raw}"`);
  }
  // Dashboard link pasted by mistake: https://supabase.com/dashboard/project/<ref>/...
  const dashboard = url.pathname.match(/\/project\/([a-z0-9]+)/i);
  if (url.hostname.endsWith("supabase.com") && dashboard) {
    return `https://${dashboard[1]}.supabase.co`;
  }
  if (!url.hostname.endsWith(".supabase.co") && !url.hostname.includes("localhost")) {
    console.error(`[supabase] Unexpected NEXT_PUBLIC_SUPABASE_URL host: ${url.hostname}`);
  }
  return url.origin;
}

export function supabaseAnonKey(): string {
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return key;
}
