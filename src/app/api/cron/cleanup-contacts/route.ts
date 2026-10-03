import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Backup for the pg_cron job: deletes contacts not converted within 30 days.
 * Called daily by Vercel Cron (see vercel.json), which sends "Authorization: Bearer $CRON_SECRET".
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await createAdminClient().rpc("delete_old_contacts");
  if (error) {
    console.error("[cron] delete_old_contacts failed", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
  return NextResponse.json({ deleted: data ?? 0 });
}
