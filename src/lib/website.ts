import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { homepageDefaults, parseHomepageContent } from "@/lib/website-content";
import { getSettings } from "@/lib/auth";

export const getPublicSettings = cache(async () => getSettings(createClient(supabaseUrl(), supabaseAnonKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})));

export const getHomepage = cache(async () => {
  // Public content must not depend on a visitor's incomplete MFA session.
  const supabase = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.from("website_content")
    .select("content, revision").eq("id", "home").maybeSingle();
  if (error) {
    console.error("[website] Homepage load failed", error.code);
    throw new Error("Unable to load homepage content. Run the website migration.");
  }
  if (!data) return { content: homepageDefaults, revision: 0 };
  const content = parseHomepageContent(data.content, supabaseUrl());
  if (!content) {
    console.error("[website] Invalid saved homepage content");
    throw new Error("Invalid homepage content");
  }
  return { content, revision: Number(data.revision) };
});
