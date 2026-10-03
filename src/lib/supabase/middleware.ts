import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Refreshes the auth session cookie and routes visitors to the right step.
 * This is only a first filter on the (verified) JWT claims: pages, server
 * actions and the database each enforce the MFA gate and session limits again.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const path = request.nextUrl.pathname;
  const isPrivate = path.startsWith("/admin") || path.startsWith("/dashboard");
  const isSecurity = path === "/security" || path.startsWith("/security/");

  const redirectTo = (pathname: string, keepNext: boolean) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    if (keepNext) url.searchParams.set("next", path);
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed session cookies.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (isPrivate) {
    if (!claims) return redirectTo("/login", false);
    if (claims.aal !== "aal2") return redirectTo("/security", true);
  }
  if (isSecurity && !claims && path !== "/security/session-ended") {
    return redirectTo("/login", false);
  }

  return response;
}