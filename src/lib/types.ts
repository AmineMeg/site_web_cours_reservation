export type Role = "teacher" | "student";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  email: string;
  phone: string;
  objectives: string;
  teacher_notes: string;
  country: string;
  city: string;
  timezone: string;
  credits: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
  converted_at: string | null;
  student_id: string | null;
  country: string;
  city: string;
  timezone: string;
  trial_declined_at: string | null;
}

export interface TrialBooking {
  id: string;
  contact_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  cancel_message: string | null;
}

export interface CreditBatch {
  id: string;
  remaining: number;
  expires_at: string;
}

export interface WeeklyAvailability {
  weekday: number; // 0 = Sunday ... 6 = Saturday
  is_active: boolean;
  start_time: string; // "HH:MM" or "HH:MM:SS"
  end_time: string;
}

export interface BlockedSlot {
  id: string;
  day: string; // "YYYY-MM-DD"
  start_time: string | null; // null = whole day
  end_time: string | null;
}

export type BookingStatus = "booked" | "cancelled";

export interface Booking {
  id: string;
  student_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  cancel_message: string | null;
  cancelled_at: string | null;
  created_at: string;
  credits_used: number;
  teacher_request_id: string | null;
}

export type StudentCard = Pick<Profile, "id" | "full_name" | "email" | "phone" | "objectives" | "credits" | "timezone">;

export interface BookingWithStudent extends Booking {
  student: StudentCard | null;
}

export interface Message {
  id: string;
  student_id: string;
  body: string;
  created_at: string;
}

export interface AppSettings {
  timezone: string;
  lesson_minutes: number;
  booking_window_days: number;
  min_notice_hours: number;
  credit_validity_months: number;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}
