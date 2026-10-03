import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { defaultSettings } from "@/lib/config";
import type { AppSettings, Profile } from "@/lib/types";

/** Current user + profile (cached for the duration of one request). */
export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, profile: null as Profile | null };

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return { supabase, profile: (data as Profile | null) ?? null };
});

export async function requireTeacher() {
  const { supabase, profile } = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== "teacher") redirect("/dashboard");
  return { supabase, profile };
}

export async function requireStudent() {
  const { supabase, profile } = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role === "teacher") redirect("/admin");
  if (!profile.is_active) redirect("/login");
  return { supabase, profile };
}

export async function getSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("timezone, lesson_minutes, booking_window_days, min_notice_hours")
    .eq("id", 1)
    .maybeSingle();
  return (data as AppSettings | null) ?? defaultSettings;
}
