import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchSecurityStatus } from "@/lib/auth";
import { endLocalSession } from "@/lib/security/session";
import { sessionEndedMessage } from "@/lib/i18n/security";

/**
 * Landing point when the database reports the session as unusable: signs the
 * browser out and shows the reason on the login page. A still-valid session is
 * never signed out from here (a GET link cannot log a user out).
 */
export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("reason");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let reason = sessionEndedMessage(requested) ? requested! : "revoked";
  if (user) {
    try {
      const status = await fetchSecurityStatus(supabase);
      if (status.sessionOk) return NextResponse.redirect(new URL("/security", request.url), 303);
      reason = status.reason;
    } catch {
      reason = "revoked";
    }
  }
  await endLocalSession(supabase);
  const target = new URL("/login", request.url);
  target.searchParams.set("reason", reason);
  return NextResponse.redirect(target, 303);
}