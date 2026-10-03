"use server";

import { createClient } from "@/lib/supabase/server";
import { notifyTeacherNewContact } from "@/lib/notifications";
import { EMAIL_REGEX, field } from "@/lib/utils";
import { t } from "@/lib/i18n";

type FieldName = "name" | "email" | "phone" | "message";

export interface ContactFormState {
  status: "idle" | "success" | "error";
  message: string;
  errors?: Partial<Record<FieldName, string>>;
}

export async function submitContact(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  // Honeypot: real visitors never fill this hidden field, bots usually do.
  if (field(formData, "company")) {
    return { status: "success", message: t.landing.contact.success };
  }

  const data = {
    name: field(formData, "name"),
    email: field(formData, "email").toLowerCase(),
    phone: field(formData, "phone"),
    message: field(formData, "message"),
  };

  const e = t.landing.contact.errors;
  const errors: Partial<Record<FieldName, string>> = {};
  if (!data.name || data.name.length > 120) errors.name = e.name;
  if (!EMAIL_REGEX.test(data.email) || data.email.length > 254) errors.email = e.email;
  if (data.phone.length > 40) errors.phone = e.phone;
  if (data.message.length > 2000) errors.message = e.message;
  if (Object.keys(errors).length > 0) {
    return { status: "error", message: Object.values(errors)[0]!, errors };
  }

  // 1) Save in the `contacts` table (allowed for anonymous visitors by RLS, insert only).
  const supabase = await createClient();
  const { error } = await supabase.from("contacts").insert(data);
  if (error) {
    console.error("[contact] insert failed", error);
    return { status: "error", message: t.common.error };
  }

  // 2) Tell the teacher (email placeholder, see src/lib/email.ts).
  await notifyTeacherNewContact(data);

  return { status: "success", message: t.landing.contact.success };
}
