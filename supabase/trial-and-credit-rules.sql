-- Run after teacher-booking.sql and student-reviews.sql, before public-trial-booking.sql.
-- Existing available credits receive 12 months from this migration, once only.
begin;

alter table public.app_settings add column if not exists credit_validity_months int not null default 12
  check (credit_validity_months between 1 and 120);
alter table public.contacts add column if not exists country text not null default '' check (length(country) <= 100);
alter table public.contacts add column if not exists city text not null default '' check (length(city) <= 100);
alter table public.contacts add column if not exists timezone text not null default 'America/Sao_Paulo';
alter table public.contacts add column if not exists trial_declined_at timestamptz;
alter table public.profiles add column if not exists country text not null default '' check (length(country) <= 100);
alter table public.profiles add column if not exists city text not null default '' check (length(city) <= 100);
alter table public.profiles add column if not exists timezone text not null default 'America/Sao_Paulo';

create table if not exists public.trial_links (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null
);
create table if not exists public.trial_bookings (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'booked',
  cancel_message text,
  created_at timestamptz not null default now(),
  check (ends_at = starts_at + interval '30 minutes')
);
create unique index if not exists trial_one_active_contact on public.trial_bookings(contact_id) where status = 'booked';
create index if not exists trial_times on public.trial_bookings(starts_at) where status = 'booked';

create table if not exists public.credit_batches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  remaining int not null check (remaining >= 0),
  added_at timestamptz not null default now(),
  expires_at timestamptz not null,
  migration_key text unique,
  check (expires_at > added_at)
);
create index if not exists credits_student_expiry on public.credit_batches(student_id, expires_at);
alter table public.bookings add column if not exists credit_batch_id uuid references public.credit_batches(id);

insert into public.credit_batches(student_id, remaining, expires_at, migration_key)
select id, credits, now() + interval '12 months', 'balance-' || id from public.profiles where role = 'student'
on conflict (migration_key) do nothing;
-- Legacy charged bookings retain a refundable credit without changing today's balance.
insert into public.credit_batches(student_id, remaining, expires_at, migration_key)
select student_id, 0, now() + interval '12 months', 'booking-' || id from public.bookings
where credits_used = 1 and status = 'booked' and credit_batch_id is null
on conflict (migration_key) do nothing;
update public.bookings b set credit_batch_id = c.id from public.credit_batches c
where c.migration_key = 'booking-' || b.id and b.credit_batch_id is null;

alter table public.trial_links enable row level security;
alter table public.trial_bookings enable row level security;
alter table public.credit_batches enable row level security;
revoke all on public.trial_links, public.trial_bookings, public.credit_batches from public, anon, authenticated;
grant all on public.trial_links to service_role;
grant select on public.trial_bookings, public.credit_batches to authenticated;
grant all on public.trial_bookings, public.credit_batches to service_role;
drop policy if exists "trials: teacher reads" on public.trial_bookings;
create policy "trials: teacher reads" on public.trial_bookings for select to authenticated using (public.is_teacher());
drop policy if exists "credits: own or teacher" on public.credit_batches;
create policy "credits: own or teacher" on public.credit_batches for select to authenticated
using (public.security_gate() and (student_id = auth.uid() or public.is_teacher()));
-- Anonymous contact insertion now goes through the server-only atomic issuance RPC.
revoke insert on public.contacts from anon, authenticated;

create or replace function public.validate_location()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'INVALID_TIMEZONE';
  end if;
  if tg_table_name = 'profiles' and tg_op = 'UPDATE' then
    if current_user in ('anon', 'authenticated', 'service_role') and new.credits <> old.credits then
      raise exception 'USE_CREDIT_RPC';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_contact_location on public.contacts;
create trigger validate_contact_location before insert or update on public.contacts
for each row execute function public.validate_location();
drop trigger if exists validate_profile_location on public.profiles;
create trigger validate_profile_location before insert or update on public.profiles
for each row execute function public.validate_location();

create or replace function public.sync_credit_balance(p_student uuid)
returns int language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  select coalesce(sum(remaining), 0)::int into n from public.credit_batches
  where student_id = p_student and expires_at > now();
  update public.profiles set credits = n where id = p_student and credits <> n;
  return n;
end;
$$;
create or replace function public.refresh_credit_balances()
returns void language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  perform public.security_assert_gate();
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  for r in select id from public.profiles where role = 'student'
    and (id = auth.uid() or public.is_teacher()) order by id
  loop perform public.sync_credit_balance(r.id); end loop;
end;
$$;

create or replace function public.take_credit(p_student uuid, p_end timestamptz)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  select id into v_id from public.credit_batches
  where student_id = p_student and remaining > 0 and expires_at > now() and expires_at >= p_end
  order by expires_at, added_at, id limit 1 for update;
  if not found then raise exception 'NO_VALID_CREDITS'; end if;
  update public.credit_batches set remaining = remaining - 1 where id = v_id;
  perform public.sync_credit_balance(p_student);
  return v_id;
end;
$$;
create or replace function public.adjust_credits(p_student_id uuid, p_delta int)
returns int language plpgsql security definer set search_path = ''
as $$
declare r record; needed int; months int;
begin
  perform public.security_assert_gate();
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  if p_delta is null or p_delta = 0 or p_delta not between -100 and 100 then raise exception 'INVALID_AMOUNT'; end if;
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  perform 1 from public.profiles where id = p_student_id and role = 'student' for update;
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  if p_delta > 0 then
    select credit_validity_months into months from public.app_settings where id = 1;
    insert into public.credit_batches(student_id, remaining, expires_at)
    values (p_student_id, p_delta, now() + make_interval(months => months));
  else
    needed := -p_delta;
    for r in select * from public.credit_batches where student_id = p_student_id and remaining > 0
      and expires_at > now() order by expires_at, added_at, id for update
    loop
      update public.credit_batches set remaining = remaining - least(needed, r.remaining) where id = r.id;
      needed := greatest(0, needed - r.remaining);
      exit when needed = 0;
    end loop;
  end if;
  return public.sync_credit_balance(p_student_id);
end;
$$;

-- Shared slot check: trials use 30-minute steps; regular lessons keep their grid.
create or replace function public.duration_slot_available(p_start timestamptz, p_minutes int)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare s public.app_settings; w public.weekly_availability; l timestamp; e timestamp; finish timestamptz;
begin
  if p_start is null or not isfinite(p_start) or p_minutes not between 15 and 240 then return false; end if;
  select * into s from public.app_settings where id = 1;
  finish := p_start + make_interval(mins => p_minutes);
  l := p_start at time zone s.timezone; e := finish at time zone s.timezone;
  if p_start < now() + make_interval(hours => s.min_notice_hours)
    or p_start > now() + make_interval(days => s.booking_window_days) or l::date <> e::date
    or e - l <> make_interval(mins => p_minutes) then return false; end if;
  select * into w from public.weekly_availability where weekday = extract(dow from l)::int;
  if not found or not w.is_active or l::time < w.start_time or e::time > w.end_time then return false; end if;
  if extract(epoch from (l::time - w.start_time))::numeric % (p_minutes * 60) <> 0 then return false; end if;
  if exists(select 1 from public.blocked_slots b where b.day = l::date
    and (b.start_time is null or (b.start_time < e::time and b.end_time > l::time))) then return false; end if;
  return not exists(select 1 from public.bookings b where b.status = 'booked' and b.starts_at < finish and b.ends_at > p_start)
    and not exists(select 1 from public.trial_bookings b where b.status = 'booked' and b.starts_at < finish and b.ends_at > p_start);
end;
$$;
create or replace function public.is_slot_available(p_starts_at timestamptz)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.security_assert_gate();
  return public.duration_slot_available(p_starts_at, (select lesson_minutes from public.app_settings where id = 1));
end;
$$;
create or replace function public.get_busy_slots(p_from timestamptz, p_to timestamptz)
returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.security_assert_gate();
  return query select b.starts_at, b.ends_at from public.bookings b
    where b.status = 'booked' and b.starts_at < p_to and b.ends_at > p_from
    union all select b.starts_at, b.ends_at from public.trial_bookings b
    where b.status = 'booked' and b.starts_at < p_to and b.ends_at > p_from;
end;
$$;
create or replace function public.book_lesson(p_starts_at timestamptz)
returns public.bookings language plpgsql security definer set search_path = ''
as $$
declare p public.profiles; b public.bookings; finish timestamptz; batch uuid;
begin
  perform public.security_assert_gate();
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  select * into p from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'NOT_LOGGED_IN'; end if;
  if p.role <> 'student' or not p.is_active then raise exception 'NOT_ALLOWED'; end if;
  if not public.is_slot_available(p_starts_at) then raise exception 'SLOT_NOT_AVAILABLE'; end if;
  finish := p_starts_at + make_interval(mins => (select lesson_minutes from public.app_settings where id = 1));
  batch := public.take_credit(p.id, finish);
  insert into public.bookings(student_id, starts_at, ends_at, credits_used, credit_batch_id)
  values(p.id, p_starts_at, finish, 1, batch) returning * into b;
  return b;
end;
$$;
create or replace function public.teacher_book_lesson(
  p_student_id uuid, p_day date, p_time time, p_use_credit boolean, p_exceptional boolean, p_request_id uuid
)
returns table(booking_id uuid, starts_at timestamptz, credits_used integer, created boolean)
language plpgsql security definer set search_path = ''
as $$
declare s public.app_settings; b public.bookings; v_start timestamptz; v_end timestamptz; batch uuid;
begin
  perform public.security_assert_gate();
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  if p_student_id is null or p_day is null or not isfinite(p_day) or p_time is null
    or p_time >= time '24:00' or extract(second from p_time) <> 0
    or p_use_credit is null or p_exceptional is null or p_request_id is null then raise exception 'INVALID_BOOKING'; end if;
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  select * into s from public.app_settings where id = 1;
  v_start := (p_day + p_time) at time zone s.timezone;
  v_end := v_start + make_interval(mins => s.lesson_minutes);
  select * into b from public.bookings where teacher_request_id = p_request_id;
  if found then
    if b.student_id <> p_student_id or b.starts_at <> v_start or b.credits_used <> (case when p_use_credit then 1 else 0 end)
      then raise exception 'REQUEST_CONFLICT'; end if;
    return query select b.id, b.starts_at, b.credits_used, false; return;
  end if;
  perform 1 from public.profiles where id = p_student_id and role = 'student' and is_active for update;
  if not found then raise exception 'STUDENT_NOT_ACTIVE'; end if;
  if v_start <= now() or (v_end at time zone s.timezone)::date <> p_day
    or (v_start at time zone s.timezone)::time <> p_time then raise exception 'INVALID_BOOKING'; end if;
  if not p_exceptional and not public.is_slot_available(v_start) then raise exception 'SLOT_NOT_AVAILABLE'; end if;
  if exists(select 1 from public.bookings k where status = 'booked' and k.starts_at < v_end and k.ends_at > v_start)
    or exists(select 1 from public.trial_bookings k where status = 'booked' and k.starts_at < v_end and k.ends_at > v_start)
    then raise exception 'SLOT_NOT_AVAILABLE'; end if;
  if p_use_credit then batch := public.take_credit(p_student_id, v_end); end if;
  insert into public.bookings(student_id, starts_at, ends_at, credits_used, teacher_request_id, credit_batch_id)
  values(p_student_id, v_start, v_end, case when p_use_credit then 1 else 0 end, p_request_id, batch) returning * into b;
  return query select b.id, b.starts_at, b.credits_used, true;
end;
$$;

create or replace function public.cancel_lesson(p_booking_id uuid, p_message text)
returns public.bookings language plpgsql security definer set search_path = ''
as $$
declare b public.bookings; teacher boolean;
begin
  perform public.security_assert_gate();
  teacher := public.is_teacher();
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  select * into b from public.bookings where id = p_booking_id and status = 'booked' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if not teacher and b.student_id <> auth.uid() then raise exception 'NOT_ALLOWED'; end if;
  if not teacher and b.starts_at < now() + interval '24 hours' then raise exception 'CANCELLATION_TOO_LATE'; end if;
  update public.bookings set status = 'cancelled', cancel_message = left(coalesce(p_message, ''), 2000),
    cancelled_at = now() where id = b.id returning * into b;
  if b.credits_used = 1 then
    if b.credit_batch_id is null then raise exception 'MISSING_CREDIT_BATCH'; end if;
    update public.credit_batches set remaining = remaining + 1 where id = b.credit_batch_id;
    perform public.sync_credit_balance(b.student_id);
  end if;
  return b;
end;
$$;

create or replace function public.issue_trial_link(
  p_name text, p_email text, p_phone text, p_message text, p_country text, p_city text, p_timezone text, p_hash text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare c public.contacts;
begin
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  if length(btrim(p_country)) not between 1 and 100 or length(btrim(p_city)) not between 1 and 100
    or not exists(select 1 from pg_timezone_names where name = p_timezone) then raise exception 'INVALID_LOCATION'; end if;
  if exists(select 1 from public.profiles where lower(email) = lower(p_email) and role = 'student') then raise exception 'ALREADY_STUDENT'; end if;
  select * into c from public.contacts where lower(email) = lower(p_email) and converted_at is null
    order by created_at desc limit 1 for update;
  if found then
    if c.trial_declined_at is not null then raise exception 'TRIAL_DECLINED'; end if;
    if exists(select 1 from public.trial_bookings where contact_id = c.id and status = 'booked') then raise exception 'TRIAL_ALREADY_BOOKED'; end if;
    if exists(select 1 from public.trial_links where contact_id = c.id and expires_at > now()) then raise exception 'LINK_ALREADY_SENT'; end if;
    update public.contacts set name = p_name, phone = p_phone, message = p_message,
      country = p_country, city = p_city, timezone = p_timezone, created_at = now() where id = c.id;
  else
    insert into public.contacts(name,email,phone,message,country,city,timezone)
    values(p_name,lower(p_email),p_phone,p_message,p_country,p_city,p_timezone) returning * into c;
  end if;
  insert into public.trial_links(contact_id,token_hash,expires_at) values(c.id,p_hash,now() + interval '7 days')
  on conflict(contact_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at;
  return c.id;
end;
$$;
create or replace function public.trial_contact(p_hash text)
returns public.contacts language plpgsql stable security definer set search_path = ''
as $$
declare c public.contacts;
begin
  select t.* into c from public.contacts t join public.trial_links l on l.contact_id = t.id
    where l.token_hash = p_hash and l.expires_at > now() and t.converted_at is null and t.trial_declined_at is null;
  if not found then raise exception 'LINK_EXPIRED'; end if;
  return c;
end;
$$;
create or replace function public.trial_context(p_hash text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare c public.contacts; s public.app_settings; slots jsonb; b public.trial_bookings;
begin
  c := public.trial_contact(p_hash);
  select * into s from public.app_settings where id = 1;
  select * into b from public.trial_bookings where contact_id = c.id and status = 'booked';
  select coalesce(jsonb_agg(jsonb_build_object('startsAt', start_at, 'endsAt', start_at + interval '30 minutes') order by start_at), '[]')
    into slots from (
      select (d::date + w.start_time + make_interval(mins => n * 30)) at time zone s.timezone as start_at
      from generate_series((now() at time zone s.timezone)::date::timestamp,
        (now() at time zone s.timezone)::date::timestamp + make_interval(days => s.booking_window_days), interval '1 day') d
      join public.weekly_availability w on w.weekday = extract(dow from d)::int and w.is_active
      cross join lateral generate_series(0, floor(extract(epoch from (w.end_time - w.start_time))/1800)::int - 1) n
    ) candidates where public.duration_slot_available(start_at, 30);
  return jsonb_build_object('contact', to_jsonb(c), 'booking', case when b.id is null then null else to_jsonb(b) end,
    'expires_at', (select expires_at from public.trial_links where contact_id = c.id), 'slots', slots);
end;
$$;
create or replace function public.book_trial(p_hash text, p_start timestamptz)
returns public.trial_bookings language plpgsql security definer set search_path = ''
as $$
declare c public.contacts; b public.trial_bookings;
begin
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  c := public.trial_contact(p_hash);
  if exists(select 1 from public.trial_bookings where contact_id = c.id and status = 'booked') then raise exception 'TRIAL_ALREADY_BOOKED'; end if;
  if not public.duration_slot_available(p_start, 30) then raise exception 'SLOT_NOT_AVAILABLE'; end if;
  insert into public.trial_bookings(contact_id,starts_at,ends_at)
  values(c.id,p_start,p_start + interval '30 minutes') returning * into b;
  return b;
end;
$$;
create or replace function public.cancel_trial(p_hash text)
returns public.trial_bookings language plpgsql security definer set search_path = ''
as $$
declare c public.contacts; b public.trial_bookings;
begin
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  c := public.trial_contact(p_hash);
  select * into b from public.trial_bookings where contact_id = c.id and status = 'booked' for update;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  if b.starts_at < now() + interval '24 hours' then raise exception 'CANCELLATION_TOO_LATE'; end if;
  update public.trial_bookings set status = 'cancelled', cancel_message = 'Cancelada pelo contato'
    where id = b.id returning * into b;
  return b;
end;
$$;
create or replace function public.teacher_cancel_trial(p_id uuid, p_message text)
returns public.trial_bookings language plpgsql security definer set search_path = ''
as $$
declare b public.trial_bookings;
begin
  perform public.security_assert_gate();
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  if length(btrim(coalesce(p_message, ''))) = 0 then raise exception 'MESSAGE_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  update public.trial_bookings set status = 'cancelled', cancel_message = left(p_message, 2000)
    where id = p_id and status = 'booked' returning * into b;
  if not found then raise exception 'BOOKING_NOT_FOUND'; end if;
  return b;
end;
$$;
create or replace function public.can_convert_contact(p_id uuid)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.security_assert_gate();
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  return exists(select 1 from public.contacts c join public.trial_bookings b on b.contact_id = c.id
    where c.id = p_id and c.converted_at is null and c.trial_declined_at is null
    and b.status = 'booked' and b.starts_at <= now());
end;
$$;
create or replace function public.renew_trial_link(p_id uuid, p_hash text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.security_assert_gate();
  if not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  perform 1 from public.contacts where id = p_id and converted_at is null and trial_declined_at is null for update;
  if not found then raise exception 'NOT_ALLOWED'; end if;
  insert into public.trial_links(contact_id, token_hash, expires_at) values(p_id, p_hash, now() + interval '7 days')
    on conflict(contact_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at;
end;
$$;
create or replace function public.gate_contact_decision()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.converted_at is not null and old.converted_at is null and new.trial_declined_at is not null then
    raise exception 'TRIAL_DECLINED';
  end if;
  if new.converted_at is not null and old.converted_at is null and not exists(
    select 1 from public.trial_bookings where contact_id = old.id and status = 'booked' and starts_at <= now()
  ) then raise exception 'TRIAL_NOT_STARTED'; end if;
  if new.trial_declined_at is not null and old.trial_declined_at is null and exists(
    select 1 from public.trial_bookings where contact_id = old.id and status = 'booked' and starts_at > now()
  ) then raise exception 'TRIAL_NOT_STARTED'; end if;
  return new;
end;
$$;
drop trigger if exists gate_contact_decision on public.contacts;
create trigger gate_contact_decision before update on public.contacts for each row execute function public.gate_contact_decision();

create or replace function public.delete_old_contacts()
returns int language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  delete from public.contacts c where converted_at is null and created_at < now() - interval '30 days'
    and not exists(select 1 from public.trial_bookings b where b.contact_id = c.id)
    and not exists(select 1 from public.trial_links l where l.contact_id = c.id and l.expires_at > now());
  get diagnostics n = row_count; return n;
end;
$$;

revoke all on function public.validate_location(), public.sync_credit_balance(uuid), public.take_credit(uuid,timestamptz),
  public.duration_slot_available(timestamptz,int), public.trial_contact(text), public.gate_contact_decision()
  from public, anon, authenticated, service_role;
revoke all on function public.issue_trial_link(text,text,text,text,text,text,text,text), public.trial_context(text),
  public.book_trial(text,timestamptz), public.cancel_trial(text) from public, anon, authenticated;
grant execute on function public.issue_trial_link(text,text,text,text,text,text,text,text), public.trial_context(text),
  public.book_trial(text,timestamptz), public.cancel_trial(text) to service_role;
revoke all on function public.refresh_credit_balances(), public.can_convert_contact(uuid), public.teacher_cancel_trial(uuid,text),
  public.renew_trial_link(uuid,text)
  from public, anon, service_role;
grant execute on function public.refresh_credit_balances(), public.can_convert_contact(uuid), public.teacher_cancel_trial(uuid,text),
  public.renew_trial_link(uuid,text)
  to authenticated;
commit;
