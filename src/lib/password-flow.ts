import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authFlowSecret } from "@/lib/auth-links";
import { signPasswordFlow, verifyPasswordFlow } from "@/lib/auth-flow-proof";

export const PASSWORD_FLOW_COOKIE = "auth_password_flow";

export async function markPasswordFlow() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub || typeof data.claims.session_id !== "string") {
    throw new Error("Unable to verify password setup session");
  }
  const value = signPasswordFlow({
    userId: data.claims.sub,
    sessionId: data.claims.session_id,
    expiresAt: Date.now() + 10 * 60 * 1000,
  }, authFlowSecret());
  (await cookies()).set(PASSWORD_FLOW_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

export async function requirePasswordFlow() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const value = (await cookies()).get(PASSWORD_FLOW_COOKIE)?.value;
  if (error || !user || claimsError || !data || !value
    || typeof data.claims.session_id !== "string"
    || !verifyPasswordFlow(value, authFlowSecret(), user.id, data.claims.session_id)) {
    redirect("/auth/forgot-password?expired=1");
  }
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  if (factorsError) throw new Error("Unable to check account security");
  if (factors.all.some((factor) => factor.status === "verified") && data.claims.aal !== "aal2") {
    redirect("/security?next=password");
  }
  return { supabase, user };
}
