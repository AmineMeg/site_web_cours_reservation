import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { t } from "@/lib/i18n";

/** Dates are handled as "day keys" (YYYY-MM-DD) in the teacher's timezone. */

export function todayKey(tz: string, now: Date = new Date()): string {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}

export function dayKeyOf(date: Date | string, tz: string): string {
  return formatInTimeZone(new Date(date), tz, "yyyy-MM-dd");
}

function parseKey(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function addMonthsKey(key: string, months: number): string {
  const [y, m] = parseKey(key);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday of the week containing `key`. */
export function mondayOfKey(key: string): string {
  return addDaysKey(key, -((weekdayOfKey(key) + 6) % 7));
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Converts a local wall-clock time in `tz` to a real instant. */
export function localToUtc(dayKey: string, minutes: number, tz: string): Date {
  return fromZonedTime(`${dayKey}T${minutesToTime(minutes)}:00`, tz);
}

export function formatDayKey(key: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = parseKey(key);
  return new Intl.DateTimeFormat(t.locale, { ...options, timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
}

export function formatTime(date: Date | string, tz: string): string {
  return new Intl.DateTimeFormat(t.locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string, tz: string): string {
  const label = new Intl.DateTimeFormat(t.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(new Date(date));
  return `${label} (${tz.replace(/_/g, " ")}, UTC${formatInTimeZone(new Date(date), tz, "xxx")})`;
}

export function formatDate(date: Date | string, tz: string): string {
  return new Intl.DateTimeFormat(t.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: tz,
  }).format(new Date(date));
}

/** Weekday names in the current locale, index 0 = Sunday. */
export function weekdayNames(style: "long" | "short" = "long"): string[] {
  // 2024-01-07 was a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    formatDayKey(addDaysKey("2024-01-07", i), { weekday: style }),
  );
}
