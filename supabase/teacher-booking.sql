-- Run LAST, after schema.sql, security.sql and student-password-login.sql.
-- Existing lessons used one credit; offered lessons use zero and never refund one.
begin;

alter table public.bookings add column if not exists credits_used integer not null default 1
  check (credits_used in (0, 1));
alter table public.bookings add column if not exists teacher_request_id uuid;
create unique index if not exists bookings_teacher_request_unique
  on public.bookings (teacher_request_id) where teacher_request_id is not null;

create or replace function public.teacher_book_lesson(
  p_student_id uuid, p_day date, p_time time, p_use_credit boolean,
  p_exceptional boolean, p_request_id uuid
)
returns table (booking_id uuid, starts_at timestamptz, credits_used integer, created boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  s public.app_settings;
  v_profile public.profiles;
  v_booking public.bookings;
  v_start timestamptz;
  v_end timestamptz;
begin
  perform public.security_assert_gate();
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  if p_student_id is null or p_day is null or p_time is null
    or p_use_credit is null or p_exceptional is null or p_request_id is null
    or extract(second from p_time) <> 0 or p_time >= time '24:00'
    or not isfinite(p_day) then raise exception 'INVALID_BOOKING'; end if;

  -- Same lock as student booking: exceptional lessons cannot race normal bookings.
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  select * into s from public.app_settings where id = 1 for share;
  if not found then raise exception 'INVALID_BOOKING'; end if;
  v_start := (p_day + p_time) at time zone s.timezone;
  v_end := v_start + make_interval(mins => s.lesson_minutes);

  -- A retry of the same request must not create another booking or consume a credit.
  select * into v_booking from public.bookings where teacher_request_id = p_request_id;
  if found then
    if v_booking.student_id <> p_student_id or v_booking.starts_at <> v_start
      or v_booking.credits_used <> (case when p_use_credit then 1 else 0 end) then
      raise exception 'REQUEST_CONFLICT';
    end if;
    return query select v_booking.id, v_booking.starts_at, v_booking.credits_used, false;
    return;
  end if;

  select * into v_profile from public.profiles where id = p_student_id for update;
  if not found or v_profile.role <> 'student' or not v_profile.is_active then
    raise exception 'STUDENT_NOT_ACTIVE';
  end if;
  if p_use_credit and v_profile.credits < 1 then raise exception 'NO_CREDITS'; end if;
  if v_start <= now() or (v_end at time zone s.timezone)::date <> p_day
    or (v_start at time zone s.timezone)::time <> p_time then
    raise exception 'INVALID_BOOKING';
  end if;
  if not p_exceptional and not public.is_slot_available(v_start) then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;
  if exists (
    select 1 from public.bookings b where b.status = 'booked'
      and b.starts_at < v_end and b.ends_at > v_start
  ) then raise exception 'SLOT_NOT_AVAILABLE'; end if;

  insert into public.bookings(student_id, starts_at, ends_at, credits_used, teacher_request_id)
  values(p_student_id, v_start, v_end, case when p_use_credit then 1 else 0 end, p_request_id)
  returning * into v_booking;
  if p_use_credit then
    update public.profiles set credits = credits - 1 where id = p_student_id;
  end if;
  return query select v_booking.id, v_booking.starts_at, v_booking.credits_used, true;
end;
$$;
revoke all on function public.teacher_book_lesson(uuid, date, time, boolean, boolean, uuid) from public, anon;
grant execute on function public.teacher_book_lesson(uuid, date, time, boolean, boolean, uuid) to authenticated;

create or replace function public.cancel_lesson(p_booking_id uuid, p_message text)
returns public.bookings
language plpgsql security definer set search_path = ''
as $$
declare v_booking public.bookings;
begin
  perform public.security_assert_gate();
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  -- Keep lock order consistent with both booking paths before touching profiles.
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  update public.bookings
     set status = 'cancelled', cancel_message = left(coalesce(p_message, ''), 2000), cancelled_at = now()
   where id = p_booking_id and status = 'booked'
  returning * into v_booking;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if v_booking.credits_used > 0 then
    update public.profiles set credits = credits + v_booking.credits_used where id = v_booking.student_id;
  end if;
  return v_booking;
end;
$$;

commit;
