import "server-only";
import { accountSiteUrl } from "@/lib/auth-links";

export async function verifyTurnstile(formData: FormData, action: "login" | "reset"): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  if (!secret && !siteKey) return true;
  if (!secret || !siteKey) {
    console.error("[security] Both Turnstile keys must be configured");
    return false;
  }
  const token = formData.get("cf-turnstile-response");
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });
    if (!response.ok) {
      console.error("[security] Turnstile verification unavailable", response.status);
      return false;
    }
    const result: { success?: boolean; action?: string; hostname?: string } = await response.json();
    return result.success === true && result.action === action && result.hostname === accountSiteUrl().hostname;
  } catch (error) {
    console.error("[security] Turnstile verification failed", error instanceof Error ? error.name : "unknown");
    return false;
  }
}
