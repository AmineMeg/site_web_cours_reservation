-- =============================================================================
--  Spanish Teacher – Supabase database schema
--  Run this whole file once in: Supabase Dashboard > SQL Editor > New query
--  Safe to re-run (tables use IF NOT EXISTS, functions/policies are replaced).
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. TYPES
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('teacher', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.booking_status as enum ('booked', 'cancelled');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 2. TABLES
-- -----------------------------------------------------------------------------

-- Global settings (single row). The teacher's hours are interpreted in `timezone`.
create table if not exists public.app_settings (
  id                  int primary key default 1 check (id = 1),
  timezone            text not null default 'Europe/Lisbon',
  lesson_minutes      int  not null default 60 check (lesson_minutes between 15 and 240),
  booking_window_days int  not null default 28 check (booking_window_days between 1 and 180),
  min_notice_hours    int  not null default 12 check (min_notice_hours between 0 and 168)
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- One profile per auth user (teacher or student).
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  role          public.user_role not null default 'student',
  full_name     text not null default '' check (char_length(full_name) <= 120),
  email         text not null default '' check (char_length(email) <= 254),
  phone         text not null default '' check (char_length(phone) <= 40),
  objectives    text not null default '' check (char_length(objectives) <= 4000),
  teacher_notes text not null default '' check (char_length(teacher_notes) <= 4000),
  credits       int  not null default 0 check (credits >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists profiles_role_idx on public.profiles (role, is_active);

-- People who filled the public contact form.
create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 120),
  email        text not null check (char_length(email) between 3 and 254),
  phone        text not null default '' check (char_length(phone) <= 40),
  message      text not null default '' check (char_length(message) <= 2000),
  created_at   timestamptz not null default now(),
  converted_at timestamptz,
  student_id   uuid references public.profiles (id) on delete set null
);
create index if not exists contacts_created_at_idx on public.contacts (created_at);

-- Weekly working hours: exactly one row per weekday (0 = Sunday ... 6 = Saturday).
create table if not exists public.weekly_availability (
  weekday    smallint primary key check (weekday between 0 and 6),
  is_active  boolean not null default false,
  start_time time not null default '09:00',
  end_time   time not null default '17:00',
  check (end_time > start_time)
);
insert into public.weekly_availability (weekday, is_active)
select d, d between 1 and 5 from generate_series(0, 6) as d
on conflict (weekday) do nothing;

-- Days off / blocked hours. start_time & end_time NULL = the whole day is blocked.
create table if not exists public.blocked_slots (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  start_time time,
  end_time   time,
  created_at timestamptz not null default now(),
  check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time)
  )
);
create index if not exists blocked_slots_day_idx on public.blocked_slots (day);

-- Lessons.
create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.profiles (id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  status         public.booking_status not null default 'booked',
  cancel_message text,
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  check (ends_at > starts_at)
);
-- Only one active lesson can start at a given time.
create unique index if not exists bookings_one_active_per_start
  on public.bookings (starts_at) where status = 'booked';
create index if not exists bookings_student_idx on public.bookings (student_id, starts_at);
create index if not exists bookings_starts_at_idx on public.bookings (starts_at);

-- Messages sent by students from "Contact my teacher".
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists messages_created_at_idx on public.messages (created_at desc);

-- -----------------------------------------------------------------------------
-- 3. HELPER FUNCTIONS & TRIGGERS
-- -----------------------------------------------------------------------------

create or replace function public.is_teacher()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'teacher'
  );
$$;

-- Auto-create a profile whenever an auth user is created.
-- Role is ALWAYS 'student' here; the teacher is promoted manually (see section 7).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keeps updated_at fresh and stops students from editing protected columns
-- (role, credits, is_active, email, teacher_notes). Security-definer RPCs and
-- the service role run as a different DB role, so they are not affected.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if current_user = 'authenticated' and not public.is_teacher() then
    new.role          := old.role;
    new.credits       := old.credits;
    new.is_active     := old.is_active;
    new.email         := old.email;
    new.teacher_notes := old.teacher_notes;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- -----------------------------------------------------------------------------
-- 4. BUSINESS LOGIC (RPC functions called by the app)
-- -----------------------------------------------------------------------------

-- Can a lesson starting at p_starts_at be booked right now?
create or replace function public.is_slot_available(p_starts_at timestamptz)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  s          public.app_settings;
  wa         public.weekly_availability;
  v_local    timestamp;
  v_end      timestamp;
  v_day      date;
  v_ends_at  timestamptz;
begin
  select * into s from public.app_settings where id = 1;

  v_ends_at := p_starts_at + make_interval(mins => s.lesson_minutes);
  v_local   := p_starts_at at time zone s.timezone;
  v_end     := v_local + make_interval(mins => s.lesson_minutes);
  v_day     := v_local::date;

  -- Not in the past / too soon / too far ahead.
  if p_starts_at < now() + make_interval(hours => s.min_notice_hours) then return false; end if;
  if p_starts_at > now() + make_interval(days => s.booking_window_days) then return false; end if;
  -- The lesson must finish on the same day.
  if v_end::date <> v_day then return false; end if;

  -- Inside the weekly working hours and aligned on the lesson grid.
  select * into wa from public.weekly_availability where weekday = extract(dow from v_local)::int;
  if not found or not wa.is_active then return false; end if;
  if v_local::time < wa.start_time or v_end::time > wa.end_time then return false; end if;
  if (extract(epoch from (v_local::time - wa.start_time))::int % (s.lesson_minutes * 60)) <> 0 then
    return false;
  end if;

  -- Not on a day off / blocked hour.
  if exists (
    select 1 from public.blocked_slots b
    where b.day = v_day
      and (b.start_time is null or (b.start_time < v_end::time and b.end_time > v_local::time))
  ) then return false; end if;

  -- No overlapping lesson.
  if exists (
    select 1 from public.bookings k
    where k.status = 'booked' and k.starts_at < v_ends_at and k.ends_at > p_starts_at
  ) then return false; end if;

  return true;
end;
$$;

-- Student books a lesson: checks credits + slot, creates the booking, removes 1 credit.
create or replace function public.book_lesson(p_starts_at timestamptz)
returns public.bookings
language plpgsql security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_minutes int;
  v_booking public.bookings;
begin
  -- Serialize bookings so two students can never grab overlapping slots.
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));

  select * into v_profile from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'NOT_LOGGED_IN'; end if;
  if v_profile.role <> 'student' or not v_profile.is_active then raise exception 'NOT_ALLOWED'; end if;
  if v_profile.credits < 1 then raise exception 'NO_CREDITS'; end if;
  if not public.is_slot_available(p_starts_at) then raise exception 'SLOT_NOT_AVAILABLE'; end if;

  select lesson_minutes into v_minutes from public.app_settings where id = 1;

  insert into public.bookings (student_id, starts_at, ends_at)
  values (v_profile.id, p_starts_at, p_starts_at + make_interval(mins => v_minutes))
  returning * into v_booking;

  update public.profiles set credits = credits - 1 where id = v_profile.id;

  return v_booking;
end;
$$;

-- Teacher cancels a lesson: frees the slot and gives the credit back.
create or replace function public.cancel_lesson(p_booking_id uuid, p_message text)
returns public.bookings
language plpgsql security definer set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;

  update public.bookings
     set status = 'cancelled',
         cancel_message = left(coalesce(p_message, ''), 2000),
         cancelled_at = now()
   where id = p_booking_id and status = 'booked'
  returning * into v_booking;

  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;

  update public.profiles set credits = credits + 1 where id = v_booking.student_id;

  return v_booking;
end;
$$;

-- Teacher adds/removes prepaid credits. Never goes below 0. Returns the new total.
create or replace function public.adjust_credits(p_student_id uuid, p_delta int)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_credits int;
begin
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  if p_delta = 0 or abs(p_delta) > 100 then raise exception 'INVALID_AMOUNT'; end if;

  update public.profiles
     set credits = greatest(0, credits + p_delta)
   where id = p_student_id and role = 'student'
  returning credits into v_credits;

  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  return v_credits;
end;
$$;

-- Busy times (without student names) so students can see which slots are taken.
create or replace function public.get_busy_slots(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select b.starts_at, b.ends_at
  from public.bookings b
  where auth.uid() is not null
    and b.status = 'booked'
    and b.starts_at < p_to
    and b.ends_at > p_from;
$$;

-- Removes contacts that were never converted into students after 30 days.
create or replace function public.delete_old_contacts()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.contacts
   where converted_at is null
     and created_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Function permissions: nothing for anonymous visitors.
revoke execute on function public.is_slot_available(timestamptz)           from public, anon;
revoke execute on function public.book_lesson(timestamptz)                 from public, anon;
revoke execute on function public.cancel_lesson(uuid, text)                from public, anon;
revoke execute on function public.adjust_credits(uuid, int)                from public, anon;
revoke execute on function public.get_busy_slots(timestamptz, timestamptz) from public, anon;
revoke execute on function public.delete_old_contacts()                    from public, anon, authenticated;

grant execute on function public.is_slot_available(timestamptz)            to authenticated;
grant execute on function public.book_lesson(timestamptz)                  to authenticated;
grant execute on function public.cancel_lesson(uuid, text)                 to authenticated;
grant execute on function public.adjust_credits(uuid, int)                 to authenticated;
grant execute on function public.get_busy_slots(timestamptz, timestamptz)  to authenticated;
grant execute on function public.delete_old_contacts()                     to service_role;

-- -----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
alter table public.app_settings        enable row level security;
alter table public.profiles            enable row level security;
alter table public.contacts            enable row level security;
alter table public.weekly_availability enable row level security;
alter table public.blocked_slots       enable row level security;
alter table public.bookings            enable row level security;
alter table public.messages            enable row level security;

-- app_settings
drop policy if exists "settings: everyone can read" on public.app_settings;
create policy "settings: everyone can read" on public.app_settings
  for select to anon, authenticated using (true);
drop policy if exists "settings: teacher can update" on public.app_settings;
create policy "settings: teacher can update" on public.app_settings
  for update to authenticated using (public.is_teacher()) with check (public.is_teacher());

-- profiles
drop policy if exists "profiles: read own or teacher" on public.profiles;
create policy "profiles: read own or teacher" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_teacher());
drop policy if exists "profiles: update own or teacher" on public.profiles;
create policy "profiles: update own or teacher" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_teacher())
  with check (id = auth.uid() or public.is_teacher());

-- contacts: anyone can submit the form, only the teacher can see/manage it
drop policy if exists "contacts: anyone can submit" on public.contacts;
create policy "contacts: anyone can submit" on public.contacts
  for insert to anon, authenticated
  with check (converted_at is null and student_id is null);
drop policy if exists "contacts: teacher reads" on public.contacts;
create policy "contacts: teacher reads" on public.contacts
  for select to authenticated using (public.is_teacher());
drop policy if exists "contacts: teacher updates" on public.contacts;
create policy "contacts: teacher updates" on public.contacts
  for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists "contacts: teacher deletes" on public.contacts;
create policy "contacts: teacher deletes" on public.contacts
  for delete to authenticated using (public.is_teacher());

-- weekly_availability
drop policy if exists "availability: logged-in users read" on public.weekly_availability;
create policy "availability: logged-in users read" on public.weekly_availability
  for select to authenticated using (true);
drop policy if exists "availability: teacher manages" on public.weekly_availability;
create policy "availability: teacher manages" on public.weekly_availability
  for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

-- blocked_slots
drop policy if exists "blocked: logged-in users read" on public.blocked_slots;
create policy "blocked: logged-in users read" on public.blocked_slots
  for select to authenticated using (true);
drop policy if exists "blocked: teacher manages" on public.blocked_slots;
create policy "blocked: teacher manages" on public.blocked_slots
  for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

-- bookings: read own or teacher. Writes only through book_lesson / cancel_lesson.
drop policy if exists "bookings: read own or teacher" on public.bookings;
create policy "bookings: read own or teacher" on public.bookings
  for select to authenticated using (student_id = auth.uid() or public.is_teacher());

-- messages
drop policy if exists "messages: student sends own" on public.messages;
create policy "messages: student sends own" on public.messages
  for insert to authenticated with check (student_id = auth.uid());
drop policy if exists "messages: read own or teacher" on public.messages;
create policy "messages: read own or teacher" on public.messages
  for select to authenticated using (student_id = auth.uid() or public.is_teacher());
drop policy if exists "messages: teacher deletes" on public.messages;
create policy "messages: teacher deletes" on public.messages
  for delete to authenticated using (public.is_teacher());

-- -----------------------------------------------------------------------------
-- 6. AUTOMATED JOB: delete unconverted contacts after 30 days (pg_cron)
--    pg_cron is available on the Supabase free tier. If this part fails,
--    enable it in Dashboard > Database > Extensions > pg_cron, then re-run it.
--    (The Vercel cron at /api/cron/cleanup-contacts does the same as a backup.)
-- -----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'delete-old-contacts',
  '0 3 * * *', -- every day at 03:00 UTC
  $$ select public.delete_old_contacts(); $$
);

-- -----------------------------------------------------------------------------
-- 7. MAKE THE TEACHER ACCOUNT (run once, after creating her user in
--    Authentication > Users > "Add user" > "Create new user"; replace the email):
--
--    update public.profiles
--       set role = 'teacher', full_name = 'María Fernández'
--     where email = 'teacher@example.com';
-- -----------------------------------------------------------------------------
