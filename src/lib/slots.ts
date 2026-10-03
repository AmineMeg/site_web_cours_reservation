import type { AppSettings, BlockedSlot, WeeklyAvailability } from "@/lib/types";
import { addDaysKey, localToUtc, timeToMinutes, todayKey, weekdayOfKey } from "@/lib/dates";

export interface Slot {
  startsAt: string; // ISO
  endsAt: string; // ISO
  dayKey: string; // YYYY-MM-DD in the teacher's timezone
  startMinutes: number; // minutes since local midnight
}

export interface BusyRange {
  starts_at: string;
  ends_at: string;
}

/** Every slot of a day according to the weekly hours (ignores bookings/blocks). */
export function daySlotStarts(
  dayKey: string,
  weekly: WeeklyAvailability[],
  lessonMinutes: number,
): number[] {
  const rule = weekly.find((w) => w.weekday === weekdayOfKey(dayKey));
  if (!rule || !rule.is_active) return [];
  const start = timeToMinutes(rule.start_time);
  const end = timeToMinutes(rule.end_time);
  const result: number[] = [];
  for (let m = start; m + lessonMinutes <= end; m += lessonMinutes) result.push(m);
  return result;
}

export function isBlocked(
  dayKey: string,
  startMinutes: number,
  endMinutes: number,
  blocked: BlockedSlot[],
): boolean {
  return blocked.some(
    (b) =>
      b.day === dayKey &&
      (b.start_time === null ||
        b.end_time === null ||
        (timeToMinutes(b.start_time) < endMinutes && timeToMinutes(b.end_time) > startMinutes)),
  );
}

/**
 * Bookable slots for students. Mirrors public.is_slot_available() in the database,
 * which remains the source of truth when booking.
 */
export function generateAvailableSlots(params: {
  settings: AppSettings;
  weekly: WeeklyAvailability[];
  blocked: BlockedSlot[];
  busy: BusyRange[];
  now?: Date;
}): Slot[] {
  const { settings, weekly, blocked, busy, now = new Date() } = params;
  const tz = settings.timezone;
  const minutes = settings.lesson_minutes;
  const earliest = now.getTime() + settings.min_notice_hours * 3600_000;
  const latest = now.getTime() + settings.booking_window_days * 86400_000;
  const busyRanges = busy.map((b) => [Date.parse(b.starts_at), Date.parse(b.ends_at)]);

  const slots: Slot[] = [];
  const first = todayKey(tz, now);

  for (let i = 0; i <= settings.booking_window_days; i++) {
    const dayKey = addDaysKey(first, i);
    for (const startMinutes of daySlotStarts(dayKey, weekly, minutes)) {
      const start = localToUtc(dayKey, startMinutes, tz).getTime();
      const end = start + minutes * 60_000;
      if (start < earliest || start > latest) continue;
      if (isBlocked(dayKey, startMinutes, startMinutes + minutes, blocked)) continue;
      if (busyRanges.some(([s, e]) => s < end && e > start)) continue;
      slots.push({
        startsAt: new Date(start).toISOString(),
        endsAt: new Date(end).toISOString(),
        dayKey,
        startMinutes,
      });
    }
  }
  return slots;
}
