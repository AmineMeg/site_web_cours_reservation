import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export function accountSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) throw new Error("Missing NEXT_PUBLIC_SITE_URL");
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS (except localhost)");
  }
  return new URL(url.origin);
}

export function confirmationLink(tokenHash: string, type: "invite" | "recovery"): string {
  const url = new URL("/auth/confirm", accountSiteUrl());
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}

export async function createAccountLink(email: string, type: "invite" | "recovery") {
  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type,
    email,
    options: { redirectTo: new URL("/auth/confirm", accountSiteUrl()).toString() },
  });
  if (error || !data.properties || !data.user) {
    console.error("[auth-links] generateLink failed", error?.status, error?.code);
    return null;
  }
  return { user: data.user, url: confirmationLink(data.properties.hashed_token, type) };
}

export function authFlowSecret(): string {
  const secret = process.env.SECURITY_SECRET;
  if (!secret || secret.length < 32) throw new Error("SECURITY_SECRET must contain at least 32 random characters");
  return secret;
}
