export interface TeacherBookingInput {
  studentId: string;
  day: string;
  time: string;
  useCredit: boolean;
  exceptional: boolean;
  requestId: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validTeacherBooking(value: TeacherBookingInput): boolean {
  if (!value || typeof value !== "object" ||
      typeof value.studentId !== "string" || !uuid.test(value.studentId) ||
      typeof value.requestId !== "string" || !uuid.test(value.requestId) ||
      typeof value.useCredit !== "boolean" || typeof value.exceptional !== "boolean" ||
      typeof value.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) ||
      typeof value.time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time)) return false;
  const date = new Date(`${value.day}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value.day;
}
