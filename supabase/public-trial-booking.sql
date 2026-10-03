-- Run after trial-and-credit-rules.sql. Public calendar-first trials, without Auth accounts.
begin;

create or replace function public.duration_slot_available(p_start timestamptz, p_minutes int, p_window_days int)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare s public.app_settings; w public.weekly_availability; l timestamp; e timestamp; finish timestamptz;
begin
  if p_start is null or not isfinite(p_start) or p_minutes not between 15 and 240
    or p_window_days is null or p_window_days not between 1 and 365 then return false; end if;
  select * into s from public.app_settings where id = 1;
  finish := p_start + make_interval(mins => p_minutes);
  l := p_start at time zone s.timezone; e := finish at time zone s.timezone;
  if p_start < now() + make_interval(hours => s.min_notice_hours)
    or p_start > now() + make_interval(days => p_window_days) or l::date <> e::date
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
create or replace function public.duration_slot_available(p_start timestamptz, p_minutes int)
returns boolean language sql stable security definer set search_path = ''
as $$
  select public.duration_slot_available(p_start, p_minutes,
    (select booking_window_days from public.app_settings where id = 1))
$$;

create or replace function public.trial_available_slots()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('startsAt', start_at, 'endsAt', start_at + interval '30 minutes')
    order by start_at), '[]'::jsonb)
  from (
    select (d::date + w.start_time + make_interval(mins => n * 30)) at time zone s.timezone as start_at
    from public.app_settings s
    cross join lateral generate_series((now() at time zone s.timezone)::date::timestamp,
      (now() at time zone s.timezone)::date::timestamp + interval '30 days', interval '1 day') d
    join public.weekly_availability w on w.weekday = extract(dow from d)::int and w.is_active
    cross join lateral generate_series(0, floor(extract(epoch from (w.end_time - w.start_time))/1800)::int - 1) n
    where s.id = 1
  ) candidates where public.duration_slot_available(start_at, 30, 30)
$$;
create or replace function public.trial_context(p_hash text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare c public.contacts; b public.trial_bookings;
begin
  c := public.trial_contact(p_hash);
  select * into b from public.trial_bookings where contact_id = c.id and status = 'booked';
  return jsonb_build_object('contact', to_jsonb(c), 'booking', case when b.id is null then null else to_jsonb(b) end,
    'expires_at', (select expires_at from public.trial_links where contact_id = c.id),
    'slots', public.trial_available_slots());
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
  if not public.duration_slot_available(p_start, 30, 30) then raise exception 'SLOT_NOT_AVAILABLE'; end if;
  insert into public.trial_bookings(contact_id,starts_at,ends_at)
  values(c.id,p_start,p_start + interval '30 minutes') returning * into b;
  return b;
end;
$$;

create or replace function public.submit_trial_booking(
  p_name text, p_email text, p_phone text, p_message text, p_country text, p_city text,
  p_timezone text, p_hash text, p_start timestamptz
)
returns public.trial_bookings language plpgsql security definer set search_path = ''
as $$
declare c public.contacts; b public.trial_bookings;
begin
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  if not public.duration_slot_available(p_start, 30, 30) then raise exception 'SLOT_NOT_AVAILABLE'; end if;
  -- An unbooked earlier invitation may be replaced; rollback restores it if booking fails.
  select * into c from public.contacts where lower(email) = lower(p_email) and converted_at is null
    order by created_at desc limit 1 for update;
  if found and c.trial_declined_at is null
    and not exists(select 1 from public.trial_bookings where contact_id = c.id and status = 'booked') then
    update public.trial_links set expires_at = now() where contact_id = c.id;
  end if;
  perform public.issue_trial_link(p_name,p_email,p_phone,p_message,p_country,p_city,p_timezone,p_hash);
  b := public.book_trial(p_hash,p_start);
  return b;
end;
$$;

revoke all on function public.duration_slot_available(timestamptz,int,int) from public, anon, authenticated, service_role;
revoke all on function public.trial_available_slots(),
  public.submit_trial_booking(text,text,text,text,text,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.trial_available_slots(),
  public.submit_trial_booking(text,text,text,text,text,text,text,text,timestamptz) to service_role;

-- Only update former defaults, not the teacher's customized homepage.
do $$
declare old_content jsonb; updated jsonb;
begin
  select content into old_content from public.website_content where id = 'home' for update;
  if not found then return; end if;
  updated := old_content;
  if old_content ->> 'contactSubtitle' = 'Conte um pouco sobre você e agende uma aula experimental online gratuita de 30 minutos.' then
    updated := jsonb_set(updated, '{contactSubtitle}', '"Escolha um horário nos próximos 30 dias e preencha seus dados para reservar sua aula experimental online gratuita."');
  end if;
  if old_content ->> 'contactSubmit' = 'Enviar meu pedido' then
    updated := jsonb_set(updated, '{contactSubmit}', '"Reservar minha aula experimental"');
  end if;
  if updated is distinct from old_content then
    update public.website_content set content = updated, revision = revision + 1, updated_at = now() where id = 'home';
  end if;
end;
$$;
commit;
