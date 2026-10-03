"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { parseHomepageContent } from "@/lib/website-content";
import { websiteText as w } from "@/lib/i18n/website";
import type { ActionResult } from "@/lib/types";

export async function saveHomepage(value: unknown, revision: number): Promise<ActionResult & { revision?: number }> {
  const { supabase } = await requireTeacher();
  const content = parseHomepageContent(value);
  if (!content || !Number.isInteger(revision) || revision < 0) return { ok: false, message: w.invalid };
  const { data, error } = await supabase.rpc("save_homepage", { p_content: content, p_revision: revision });
  if (error || typeof data !== "number") {
    console.error("[website] Save failed", error?.code);
    return { ok: false, message: error?.message.includes("CONTENT_CONFLICT") ? w.conflict : w.error };
  }
  revalidatePath("/");
  revalidatePath("/admin/website");
  return { ok: true, message: w.saved, revision: data };
}
