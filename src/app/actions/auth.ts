"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { field } from "@/lib/utils";
import { t } from "@/lib/i18n";

export interface LoginState {
  message: string;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: field(formData, "email").toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
  if (error || !data.user) {
    console.error("[login] signInWithPassword failed:", error?.status, error?.code, error?.message);
    return { message: t.login.error };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile) {
    console.error("[login] profile not found for user", data.user.id, data.user.email, profileError?.message);
    await supabase.auth.signOut();
    return { message: t.login.noProfile };
  }

  if (profile.role === "teacher") redirect("/admin");
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { message: t.login.inactive };
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
