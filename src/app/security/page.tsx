import { redirect } from "next/navigation";
import { getCurrentProfile, requireAuthenticatedUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/security/redirects";

/** Post-login router: setup → verify → destination. No business data is read before AAL2. */
export default async function SecurityRouterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { status } = await requireAuthenticatedUser();
  if (!status.hasVerifiedFactor) redirect("/security/setup");
  if (status.aal !== "aal2") {
    redirect(typeof next === "string" && next ? `/security/verify?next=${encodeURIComponent(next)}` : "/security/verify");
  }
  const target = safeNextPath(next);
  if (target) redirect(target);
  const { profile } = await getCurrentProfile();
  if (!profile) redirect("/security/session-ended?reason=account_missing");
  redirect(profile.role === "teacher" ? "/admin" : "/dashboard");
}