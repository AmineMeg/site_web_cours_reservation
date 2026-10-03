/** Values that are not translated (names, emails). Texts live in src/lib/i18n. */
export const siteConfig = {
  teacherName: process.env.NEXT_PUBLIC_TEACHER_NAME || "María Fernández",
  teacherEmail: process.env.NEXT_PUBLIC_TEACHER_EMAIL || "teacher@example.com",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
};

/** Used when the app_settings row cannot be read. Keep in sync with supabase/schema.sql. */
export const defaultSettings = {
  timezone: "America/Sao_Paulo",
  lesson_minutes: 60,
  booking_window_days: 28,
  min_notice_hours: 12,
};

export const CONTACT_RETENTION_DAYS = 30;
