import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueReviewInvitations } from "@/lib/review-emails";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const results = await sendDueReviewInvitations(createAdminClient());
    return NextResponse.json(results, { status: results.failed ? 500 : 200 });
  } catch {
    console.error("[reviews] Invitation cron failed");
    return NextResponse.json({ error: "Review invitations failed" }, { status: 500 });
  }
}
