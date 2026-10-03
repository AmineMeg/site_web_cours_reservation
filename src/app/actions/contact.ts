"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTeacherNewContact, sendTrialInvitation } from "@/lib/notifications";
import { newTrialToken } from "@/lib/trial";
import { limitTrialContact } from "@/lib/security/rate-limit";
import { validLocation } from "@/lib/timezones";
import { lessonRules as r } from "@/lib/i18n/lesson-rules";
import { EMAIL_REGEX, field } from "@/lib/utils";
import { t } from "@/lib/i18n";

type FieldName = "name" | "email" | "phone" | "message" | "location";

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
    country: field(formData, "country"),
    city: field(formData, "city"),
    timezone: field(formData, "timezone"),
  };

  const e = t.landing.contact.errors;
  const errors: Partial<Record<FieldName, string>> = {};
  if (!data.name || data.name.length > 120) errors.name = e.name;
  if (!EMAIL_REGEX.test(data.email) || data.email.length > 254) errors.email = e.email;
  if (data.phone.length > 40) errors.phone = e.phone;
  if (data.message.length > 2000) errors.message = e.message;
  if (!validLocation(data)) errors.location = r.locationError;
  if (Object.keys(errors).length > 0) {
    return { status: "error", message: Object.values(errors)[0]!, errors };
  }

  if (!await limitTrialContact(data.email)) return { status: "error", message: r.tooMany };
  const { token, hash } = newTrialToken();
  const { error } = await createAdminClient().rpc("issue_trial_link", {
    p_name: data.name, p_email: data.email, p_phone: data.phone, p_message: data.message,
    p_country: data.country, p_city: data.city, p_timezone: data.timezone, p_hash: hash,
  });
  if (error) {
    if (["ALREADY_STUDENT", "TRIAL_DECLINED", "TRIAL_ALREADY_BOOKED", "LINK_ALREADY_SENT"].some((code) => error.message.includes(code))) {
      return { status: "error", message: r.duplicate };
    }
    console.error("[contact] Trial issuance failed", error.code);
    return { status: "error", message: t.common.error };
  }

  const [delivery] = await Promise.all([
    sendTrialInvitation({ name: data.name, email: data.email, token }),
    notifyTeacherNewContact(data),
  ]);
  return { status: "success", message: delivery.ok ? r.sent : r.savedWithoutEmail };
}
