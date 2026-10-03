-- =============================================================================
--  Spanish Teacher – ACCOUNT SECURITY migration (idempotent, safe to re-run)
--
--  * Mandatory TOTP MFA: every policy for `authenticated` and every business
--    RPC requires an AAL2 JWT + a live tracked session + a verified TOTP
--    factor + an active profile (public.security_gate()).
--  * Finite sessions: idle and absolute limits enforced in the database,
--    revocation that takes effect before the access token expires.
--    Works on the Supabase Free plan: no paid Auth session settings needed
--    (a Pro time-box, if ever configured, is honoured as an extra cap).
--    MFA is app-based TOTP only (free); phone/SMS MFA is not used.
--  * Recent-authentication proof from the verified JWT `amr` claim.
--  * Persistent, atomic rate limits keyed by HMAC'd identifiers (no raw
--    emails or IP addresses are ever stored).
--  * One-use recovery codes (only SHA-256 hashes of 128-bit+ secrets stored).
--  * Append-only security audit trail (DB triggers for credits, bookings and
--    profile changes + server events). Never contains tokens, passwords,
--    recovery codes or IP addresses.
--
--  New projects: schema.sql already contains everything below.
--  Existing projects: run this whole file once in Supabase > SQL Editor.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- S1. SECURITY TABLES
-- -----------------------------------------------------------------------------

-- Session policy (single row). Change the values here to tune the limits.
create table if not exists public.security_settings (
  id                     int primary key default 1 check (id = 1),
  idle_timeout_minutes   int not null default 60 check (idle_timeout_minutes between 5 and 1440),
  absolute_timeout_hours int not null default 12 check (absolute_timeout_hours between 1 and 720),
  recent_auth_minutes    int not null default 10 check (recent_auth_minutes between 1 and 60)
);
insert into public.security_settings (id) values (1) on conflict (id) do nothing;

-- Activity of every Supabase Auth session (one row per auth.sessions id).
-- Once ended_at is set the session can never be used again.
create table if not exists public.security_sessions (
  session_id   uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at     timestamptz,
  end_reason   text check (end_reason in ('signed_out', 'revoked', 'idle_timeout', 'absolute_timeout'))
);
create index if not exists security_sessions_user_idx on public.security_sessions (user_id);

-- Fixed-window attempt counters. key_hash = HMAC-SHA256(server secret, identifier).
create table if not exists public.security_rate_limits (
  bucket            text not null check (bucket ~ '^[a-z0-9_.:-]{1,64}$'),
  key_hash          text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts          int not null default 0 check (attempts >= 0),
  primary key (bucket, key_hash)
);

-- One-use MFA recovery codes: SHA-256 of a 128-bit+ random secret bound to the user.
create table if not exists public.security_recovery_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  code_hash  text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  unique (user_id, code_hash)
);
create index if not exists security_recovery_codes_unused_idx
  on public.security_recovery_codes (user_id) where used_at is null;

-- Append-only audit trail (no FK: entries outlive deleted accounts).
create table if not exists public.security_audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event       text not null check (event ~ '^[a-z][a-z0-9_.]{2,63}$'),
  actor_id    uuid,
  db_role     text not null default current_user,
  subject_id  uuid,
  table_name  text,
  record_id   text,
  details     jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object')
);
create index if not exists security_audit_subject_idx on public.security_audit_log (subject_id, occurred_at desc);
create index if not exists security_audit_occurred_idx on public.security_audit_log (occurred_at);

-- -----------------------------------------------------------------------------
-- S2. AUDIT HELPERS
-- -----------------------------------------------------------------------------

-- Internal writer (not executable by API roles).
-- p_actor: only for server-side events, where auth.uid() is null (service role).
drop function if exists public.security_write_audit(text, uuid, text, text, jsonb);
create or replace function public.security_write_audit(
  p_event text, p_subject uuid, p_table text, p_record text, p_details jsonb, p_actor uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.security_audit_log (event, actor_id, db_role, subject_id, table_name, record_id, details)
  values (p_event, coalesce(auth.uid(), p_actor), coalesce(nullif(current_setting('role', true), 'none'), session_user),
          p_subject, p_table, p_record, coalesce(p_details, '{}'::jsonb));
end;
$$;

-- Server events (service role only). Details are size-limited and must be an object.
drop function if exists public.security_log_event(text, uuid, jsonb);
create or replace function public.security_log_event(
  p_event text, p_subject uuid, p_details jsonb default '{}'::jsonb, p_actor uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_event is null or p_event !~ '^[a-z][a-z0-9_.]{2,63}$' then raise exception 'INVALID_EVENT'; end if;
  if p_details is not null and (jsonb_typeof(p_details) <> 'object' or length(p_details::text) > 2000) then
    raise exception 'INVALID_DETAILS';
  end if;
  perform public.security_write_audit(p_event, p_subject, null, null, p_details, p_actor);
end;
$$;

-- The audit log is append-only for every API role.
create or replace function public.security_audit_immutable()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('postgres', 'supabase_admin') then
    raise exception 'AUDIT_LOG_IS_APPEND_ONLY' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists security_audit_immutable on public.security_audit_log;
create trigger security_audit_immutable
  before update or delete on public.security_audit_log
  for each row execute function public.security_audit_immutable();

-- -----------------------------------------------------------------------------
-- S3. SESSION / MFA GATE
-- -----------------------------------------------------------------------------

-- session_id claim of the (PostgREST-verified) JWT, or NULL.
create or replace function public.security_jwt_session_id()
returns uuid
language plpgsql stable set search_path = ''
as $$
declare
  v text := auth.jwt() ->> 'session_id';
begin
  if v is null or v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v::uuid;
end;
$$;

create or replace function public.security_has_verified_totp(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.mfa_factors f
     where f.user_id = p_user_id
       and f.factor_type::text = 'totp'
       and f.status::text = 'verified'
  );
$$;

-- The current JWT's session still exists in Supabase Auth, is tracked, not
-- ended, inside the absolute limit and active within the idle limit.
create or replace function public.security_session_valid()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from auth.sessions s
      join public.security_sessions ss on ss.session_id = s.id
      join public.security_settings cfg on cfg.id = 1
     where s.id = public.security_jwt_session_id()
       and s.user_id = auth.uid()
       and ss.user_id = s.user_id
       and ss.ended_at is null
       and coalesce((to_jsonb(s) ->> 'not_after')::timestamptz, 'infinity'::timestamptz) > now()
       and s.created_at > now() - make_interval(hours => cfg.absolute_timeout_hours)
       and ss.last_seen_at > now() - make_interval(mins => cfg.idle_timeout_minutes)
  );
$$;

-- THE gate: required by every authenticated policy and business RPC.
create or replace function public.security_gate()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and (auth.jwt() ->> 'aal') = 'aal2'
    and public.security_session_valid()
    and public.security_has_verified_totp(auth.uid())
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active),
    false);
$$;

create or replace function public.security_assert_gate()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.security_gate() then
    raise exception 'MFA_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

-- Latest TOTP verification time from the verified JWT `amr` claim.
create or replace function public.security_last_totp_at()
returns timestamptz
language sql stable set search_path = ''
as $$
  select to_timestamp(max((e ->> 'timestamp')::double precision))
    from jsonb_array_elements(
           case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
         ) as e
   where jsonb_typeof(e) = 'object'
     and e ->> 'method' in ('totp', 'mfa/totp')
     and (e ->> 'timestamp') ~ '^[0-9]{1,12}(\.[0-9]+)?$';
$$;

-- Gate + a TOTP proof younger than the window (callers may only make it stricter).
create or replace function public.security_has_recent_auth(p_max_age_seconds int default null)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_window int;
  v_last   timestamptz;
begin
  if not public.security_gate() then return false; end if;
  select recent_auth_minutes * 60 into v_window from public.security_settings where id = 1;
  if p_max_age_seconds is not null then
    v_window := least(v_window, greatest(p_max_age_seconds, 30));
  end if;
  v_last := public.security_last_totp_at();
  return v_last is not null
     and v_last > now() - make_interval(secs => v_window)
     and v_last <= now() + interval '1 minute';
end;
$$;

create or replace function public.security_assert_recent_auth(p_max_age_seconds int default null)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.security_assert_gate();
  if not public.security_has_recent_auth(p_max_age_seconds) then
    raise exception 'REAUTH_REQUIRED' using errcode = '42501';
  end if;
end;
$$;
-- Called by the server on EVERY request (any AAL): registers/touches the
-- session, enforces idle + absolute limits and reports the security state.
-- Exposes only the caller's own state (account_state is the only profile fact).
create or replace function public.security_session_status()
returns table (
  session_ok          boolean,
  reason              text,
  aal                 text,
  has_verified_factor boolean,
  account_state       text,
  last_totp_at        timestamptz,
  recent_auth_until   timestamptz,
  idle_expires_at     timestamptz,
  absolute_expires_at timestamptz
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid       uuid := auth.uid();
  v_sid       uuid := public.security_jwt_session_id();
  v_cfg       public.security_settings;
  v_created   timestamptz;
  v_activity  timestamptz;
  v_not_after timestamptz;
  v_active    boolean;
  v_ss        public.security_sessions;
begin
  if v_uid is null then raise exception 'NOT_LOGGED_IN' using errcode = '42501'; end if;

  select * into v_cfg from public.security_settings where id = 1;
  session_ok := false;
  aal := coalesce(auth.jwt() ->> 'aal', 'aal1');
  has_verified_factor := public.security_has_verified_totp(v_uid);
  select p.is_active into v_active from public.profiles p where p.id = v_uid;
  account_state := case when v_active is null then 'missing' when v_active then 'active' else 'inactive' end;
  last_totp_at := public.security_last_totp_at();
  if last_totp_at is not null then
    recent_auth_until := last_totp_at + make_interval(mins => v_cfg.recent_auth_minutes);
  end if;

  select s.created_at,
         greatest(s.created_at, s.updated_at, (to_jsonb(s) ->> 'refreshed_at')::timestamptz),
         (to_jsonb(s) ->> 'not_after')::timestamptz
    into v_created, v_activity, v_not_after
    from auth.sessions s
   where s.id = v_sid and s.user_id = v_uid;

  if v_sid is null or v_created is null then
    reason := 'revoked';
    return next;
    return;
  end if;

  absolute_expires_at := v_created + make_interval(hours => v_cfg.absolute_timeout_hours);
  if v_not_after is not null and v_not_after < absolute_expires_at then
    absolute_expires_at := v_not_after;
  end if;

  -- First sighting: start from the last activity Supabase Auth recorded, so an
  -- old untracked session is judged idle instead of being revived.
  insert into public.security_sessions (session_id, user_id, last_seen_at)
  values (v_sid, v_uid, least(now(), coalesce(v_activity, now())))
  on conflict (session_id) do nothing;

  select * into v_ss from public.security_sessions where session_id = v_sid for update;
  if v_ss.user_id <> v_uid then
    reason := 'revoked';
    return next;
    return;
  end if;

  if v_ss.ended_at is null then
    if absolute_expires_at <= now() then
      update public.security_sessions set ended_at = now(), end_reason = 'absolute_timeout'
       where session_id = v_sid returning * into v_ss;
      perform public.security_write_audit('session.expired', v_uid, null, null,
        jsonb_build_object('reason', 'absolute_timeout'));
    elsif v_ss.last_seen_at <= now() - make_interval(mins => v_cfg.idle_timeout_minutes) then
      update public.security_sessions set ended_at = now(), end_reason = 'idle_timeout'
       where session_id = v_sid returning * into v_ss;
      perform public.security_write_audit('session.expired', v_uid, null, null,
        jsonb_build_object('reason', 'idle_timeout'));
    end if;
  end if;

  if v_ss.ended_at is not null then
    reason := coalesce(v_ss.end_reason, 'revoked');
    return next;
    return;
  end if;

  if v_ss.last_seen_at < now() - interval '30 seconds' then
    update public.security_sessions set last_seen_at = now()
     where session_id = v_sid returning * into v_ss;
  end if;
  idle_expires_at := v_ss.last_seen_at + make_interval(mins => v_cfg.idle_timeout_minutes);

  if account_state <> 'active' then
    reason := 'account_' || account_state;
    return next;
    return;
  end if;

  session_ok := true;
  reason := 'ok';
  return next;
end;
$$;

-- The caller ends its own current session (used on sign-out).
create or replace function public.security_end_current_session()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_sid uuid := public.security_jwt_session_id();
begin
  if auth.uid() is null or v_sid is null then return; end if;
  insert into public.security_sessions as ss (session_id, user_id, last_seen_at, ended_at, end_reason)
  values (v_sid, auth.uid(), now(), now(), 'signed_out')
  on conflict (session_id) do update
    set ended_at = coalesce(ss.ended_at, now()), end_reason = coalesce(ss.end_reason, 'signed_out')
    where ss.user_id = auth.uid();
end;
$$;

-- Service role: immediately ends every session of a user (optionally keeping one).
-- Also deletes the Supabase Auth sessions (and so their refresh tokens) when allowed.
create or replace function public.revoke_user_sessions(p_user_id uuid, p_except_session uuid default null)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_count int;
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;

  insert into public.security_sessions as ss (session_id, user_id, last_seen_at, ended_at, end_reason)
  select s.id, s.user_id, now(), now(), 'revoked'
    from auth.sessions s
   where s.user_id = p_user_id and s.id is distinct from p_except_session
  on conflict (session_id) do update
    set ended_at = coalesce(ss.ended_at, now()), end_reason = coalesce(ss.end_reason, 'revoked');

  update public.security_sessions
     set ended_at = now(), end_reason = 'revoked'
   where user_id = p_user_id and ended_at is null and session_id is distinct from p_except_session;

  select count(*) into v_count from public.security_sessions
   where user_id = p_user_id and session_id is distinct from p_except_session and end_reason = 'revoked';

  begin
    delete from auth.sessions where user_id = p_user_id and id is distinct from p_except_session;
  exception when insufficient_privilege then
    null; -- The tracked rows above already block these sessions everywhere.
  end;

  perform public.security_write_audit(
    case when p_except_session is null then 'session.revoked_all' else 'session.revoked_others' end,
    p_user_id, null, null, '{}'::jsonb);
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- S4. RATE LIMITING (service role only, atomic)
-- -----------------------------------------------------------------------------
create or replace function public.security_rate_limit_hit(
  p_bucket text, p_key_hash text, p_max_attempts int, p_window_seconds int)
returns table (allowed boolean, retry_after_seconds int)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.security_rate_limits;
begin
  if p_bucket is null or p_bucket !~ '^[a-z0-9_.:-]{1,64}$' then raise exception 'INVALID_BUCKET'; end if;
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_KEY'; end if;
  if p_max_attempts is null or p_window_seconds is null
     or p_max_attempts not between 1 and 10000 or p_window_seconds not between 1 and 86400 then
    raise exception 'INVALID_LIMIT';
  end if;

  insert into public.security_rate_limits as rl (bucket, key_hash, window_started_at, attempts)
  values (p_bucket, p_key_hash, now(), 1)
  on conflict (bucket, key_hash) do update
    set attempts = case
          when rl.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1
          else least(rl.attempts, 1000000) + 1 end,
        window_started_at = case
          when rl.window_started_at <= now() - make_interval(secs => p_window_seconds) then now()
          else rl.window_started_at end
  returning * into r;

  allowed := r.attempts <= p_max_attempts;
  retry_after_seconds := case when allowed then 0 else greatest(1, ceil(extract(epoch from
    (r.window_started_at + make_interval(secs => p_window_seconds) - now())))::int) end;
  return next;
end;
$$;

create or replace function public.security_rate_limit_reset(p_bucket text, p_key_hash text)
returns void
language sql volatile security definer set search_path = ''
as $$
  delete from public.security_rate_limits where bucket = p_bucket and key_hash = p_key_hash;
$$;

-- -----------------------------------------------------------------------------
-- S5. RECOVERY CODES
-- -----------------------------------------------------------------------------

-- Service role: replace all codes of a user that has a verified TOTP factor.
create or replace function public.security_store_recovery_codes(p_user_id uuid, p_hashes text[])
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_count int := coalesce(array_length(p_hashes, 1), 0);
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  if v_count not between 8 and 16
     or (select count(distinct h) from unnest(p_hashes) h where h ~ '^[0-9a-f]{64}$') <> v_count then
    raise exception 'INVALID_CODES';
  end if;
  if not public.security_has_verified_totp(p_user_id) then raise exception 'MFA_NOT_ENROLLED'; end if;

  delete from public.security_recovery_codes where user_id = p_user_id;
  insert into public.security_recovery_codes (user_id, code_hash)
  select p_user_id, h from unnest(p_hashes) h;

  perform public.security_write_audit('mfa.recovery_codes_generated', p_user_id, null, null,
    jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

-- Service role: atomically marks ONE unused code as used. True only once per code.
create or replace function public.security_consume_recovery_code(p_user_id uuid, p_hash text)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null or p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return false; end if;

  update public.security_recovery_codes
     set used_at = now()
   where user_id = p_user_id and code_hash = p_hash and used_at is null
  returning id into v_id;

  perform public.security_write_audit(
    case when v_id is null then 'mfa.recovery_code_rejected' else 'mfa.recovery_code_used' end,
    p_user_id, null, null, '{}'::jsonb);
  return v_id is not null;
end;
$$;

-- Service role: after the factors were deleted (user recovery code, or a reset
-- done by the teacher), drop the remaining codes and end every session.
drop function if exists public.security_finish_mfa_recovery(uuid);
create or replace function public.security_finish_mfa_recovery(p_user_id uuid, p_method text default 'recovery')
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_user_id is null then raise exception 'INVALID_USER'; end if;
  if p_method is null or p_method not in ('recovery', 'teacher') then raise exception 'INVALID_METHOD'; end if;
  if public.security_has_verified_totp(p_user_id) then raise exception 'FACTORS_STILL_PRESENT'; end if;
  delete from public.security_recovery_codes where user_id = p_user_id;
  perform public.revoke_user_sessions(p_user_id, null);
  perform public.security_write_audit('mfa.reset_by_' || p_method, p_user_id, null, null, '{}'::jsonb);
end;
$$;

-- Signed-in (AAL2) user: how many unused codes are left.
create or replace function public.security_recovery_codes_remaining()
returns int
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.security_assert_gate();
  return (select count(*) from public.security_recovery_codes where user_id = auth.uid() and used_at is null);
end;
$$;

-- Service role: housekeeping (scheduled below when pg_cron is available).
create or replace function public.security_purge_expired()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  delete from public.security_rate_limits where window_started_at < now() - interval '2 days';
  delete from public.security_sessions where coalesce(ended_at, last_seen_at) < now() - interval '45 days';
  delete from public.security_audit_log where occurred_at < now() - interval '400 days';
end;
$$;
-- -----------------------------------------------------------------------------
-- S6. GATED BUSINESS FUNCTIONS (same text as schema.sql sections 3 and 4)
-- -----------------------------------------------------------------------------

-- True only for an active teacher passing the MFA gate (never raises: used in policies).
create or replace function public.is_teacher()
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  return public.security_gate() and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'teacher' and is_active
  );
end;
$$;

-- Keeps updated_at fresh and protects sensitive columns:
--  * API roles (anon / authenticated / service_role) can never create a
--    teacher or change anybody's role (promotion is a manual SQL step);
--  * students cannot edit role, credits, is_active, email, teacher_notes;
--  * id / created_at never change and a teacher account cannot be paused.
-- Security-definer RPCs run as the function owner, so they are not affected.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
declare
  v_api boolean := current_user in ('anon', 'authenticated', 'service_role');
begin
  if tg_op = 'INSERT' then
    if v_api and new.role <> 'student' then
      raise exception 'ROLE_CHANGE_FORBIDDEN' using errcode = '42501';
    end if;
    return new;
  end if;

  new.updated_at := now();
  new.id         := old.id;
  new.created_at := old.created_at;
  if current_user = 'authenticated' then
    -- Nested so roles without EXECUTE on is_teacher() never plan the call.
    if not public.is_teacher() then
      new.role          := old.role;
      new.credits       := old.credits;
      new.is_active     := old.is_active;
      new.email         := old.email;
      new.teacher_notes := old.teacher_notes;
    end if;
  end if;
  if v_api and new.role is distinct from old.role then
    raise exception 'ROLE_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;
  if v_api and new.role = 'teacher' and old.is_active and not new.is_active then
    raise exception 'TEACHER_CANNOT_BE_PAUSED' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_columns on public.profiles;
create trigger profiles_protect_columns
  before insert or update on public.profiles
  for each row execute function public.protect_profile_columns();

-- Can a lesson starting at p_starts_at be booked right now?
create or replace function public.is_slot_available(p_starts_at timestamptz)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  s          public.app_settings;
  wa         public.weekly_availability;
  v_local    timestamp;
  v_end      timestamp;
  v_day      date;
  v_ends_at  timestamptz;
begin
  perform public.security_assert_gate();
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
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_profile public.profiles;
  v_minutes int;
  v_booking public.bookings;
begin
  perform public.security_assert_gate();
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
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings;
begin
  perform public.security_assert_gate();
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
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_credits int;
begin
  perform public.security_assert_gate();
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
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
  perform public.security_assert_gate();
  return query
    select b.starts_at, b.ends_at
      from public.bookings b
     where b.status = 'booked'
       and b.starts_at < p_to
       and b.ends_at > p_from;
end;
$$;
-- -----------------------------------------------------------------------------
-- S7. AUDIT TRIGGERS (credits, bookings, profile changes)
--     Only field names are recorded, plus values for credits/role/is_active.
-- -----------------------------------------------------------------------------
create or replace function public.security_audit_profiles()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_fields text[];
  v_event  text;
  v_details jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.security_write_audit('profile.created', new.id, 'profiles', new.id::text,
      jsonb_build_object('role', new.role, 'credits', new.credits, 'is_active', new.is_active));
    return null;
  elsif tg_op = 'DELETE' then
    perform public.security_write_audit('profile.deleted', old.id, 'profiles', old.id::text,
      jsonb_build_object('role', old.role));
    return null;
  end if;

  select coalesce(array_agg(n.key order by n.key), '{}')
    into v_fields
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
   where n.key not in ('updated_at') and n.value is distinct from o.value;

  if cardinality(v_fields) = 0 then return null; end if;

  v_details := jsonb_build_object('fields', to_jsonb(v_fields));
  if new.credits is distinct from old.credits then
    v_event := 'credits.changed';
    v_details := v_details || jsonb_build_object('credits_from', old.credits, 'credits_to', new.credits);
  elsif v_fields && array['role', 'is_active', 'email', 'teacher_notes'] then
    v_event := 'profile.sensitive_update';
  else
    v_event := 'profile.updated';
  end if;
  if new.role is distinct from old.role then
    v_details := v_details || jsonb_build_object('role_from', old.role, 'role_to', new.role);
  end if;
  if new.is_active is distinct from old.is_active then
    v_details := v_details || jsonb_build_object('is_active', new.is_active);
  end if;

  perform public.security_write_audit(v_event, new.id, 'profiles', new.id::text, v_details);
  return null;
end;
$$;

drop trigger if exists security_audit_profiles on public.profiles;
create trigger security_audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.security_audit_profiles();

create or replace function public.security_audit_bookings()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_fields text[];
begin
  if tg_op = 'INSERT' then
    perform public.security_write_audit('booking.created', new.student_id, 'bookings', new.id::text,
      jsonb_build_object('starts_at', new.starts_at, 'status', new.status));
    return null;
  elsif tg_op = 'DELETE' then
    perform public.security_write_audit('booking.deleted', old.student_id, 'bookings', old.id::text,
      jsonb_build_object('starts_at', old.starts_at, 'status', old.status));
    return null;
  end if;

  select coalesce(array_agg(n.key order by n.key), '{}')
    into v_fields
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
   where n.value is distinct from o.value;

  if cardinality(v_fields) = 0 then return null; end if;

  perform public.security_write_audit(
    case when old.status = 'booked' and new.status = 'cancelled' then 'booking.cancelled' else 'booking.updated' end,
    new.student_id, 'bookings', new.id::text,
    jsonb_build_object('fields', to_jsonb(v_fields), 'starts_at', new.starts_at, 'status', new.status));
  return null;
end;
$$;

drop trigger if exists security_audit_bookings on public.bookings;
create trigger security_audit_bookings
  after insert or update or delete on public.bookings
  for each row execute function public.security_audit_bookings();

-- -----------------------------------------------------------------------------
-- S8. PRIVILEGES
--     Supabase grants everything on new tables/functions to anon,
--     authenticated and service_role by default: revoke explicitly.
-- -----------------------------------------------------------------------------
alter table public.security_settings       enable row level security;
alter table public.security_sessions       enable row level security;
alter table public.security_rate_limits    enable row level security;
alter table public.security_recovery_codes enable row level security;
alter table public.security_audit_log      enable row level security;

revoke all on table public.security_settings, public.security_sessions, public.security_rate_limits,
  public.security_recovery_codes, public.security_audit_log
  from public, anon, authenticated, service_role;

-- Audit trail: readable (never writable) by the subject, the teacher and the server.
grant select on table public.security_audit_log to authenticated, service_role;
drop policy if exists "audit: read own or teacher" on public.security_audit_log;
create policy "audit: read own or teacher" on public.security_audit_log
  for select to authenticated using (subject_id = auth.uid() or public.is_teacher());

-- Functions: nothing by default...
revoke execute on function
  public.security_write_audit(text, uuid, text, text, jsonb, uuid),
  public.security_log_event(text, uuid, jsonb, uuid),
  public.security_audit_immutable(),
  public.security_jwt_session_id(),
  public.security_has_verified_totp(uuid),
  public.security_session_valid(),
  public.security_gate(),
  public.security_assert_gate(),
  public.security_last_totp_at(),
  public.security_has_recent_auth(int),
  public.security_assert_recent_auth(int),
  public.security_session_status(),
  public.security_end_current_session(),
  public.revoke_user_sessions(uuid, uuid),
  public.security_rate_limit_hit(text, text, int, int),
  public.security_rate_limit_reset(text, text),
  public.security_store_recovery_codes(uuid, text[]),
  public.security_consume_recovery_code(uuid, text),
  public.security_finish_mfa_recovery(uuid, text),
  public.security_recovery_codes_remaining(),
  public.security_purge_expired(),
  public.security_audit_profiles(),
  public.security_audit_bookings(),
  public.is_teacher(),
  public.is_slot_available(timestamptz),
  public.book_lesson(timestamptz),
  public.cancel_lesson(uuid, text),
  public.adjust_credits(uuid, int),
  public.get_busy_slots(timestamptz, timestamptz)
  from public, anon, authenticated, service_role;

-- ...signed-in users (every business function re-checks the MFA gate itself)...
grant execute on function
  public.security_gate(),
  public.security_has_recent_auth(int),
  public.security_assert_recent_auth(int),
  public.security_session_status(),
  public.security_end_current_session(),
  public.security_recovery_codes_remaining(),
  public.is_teacher(),
  public.is_slot_available(timestamptz),
  public.book_lesson(timestamptz),
  public.cancel_lesson(uuid, text),
  public.adjust_credits(uuid, int),
  public.get_busy_slots(timestamptz, timestamptz)
  to authenticated;

-- ...and the server (service role key, never exposed to browsers).
grant execute on function
  public.security_log_event(text, uuid, jsonb, uuid),
  public.revoke_user_sessions(uuid, uuid),
  public.security_rate_limit_hit(text, text, int, int),
  public.security_rate_limit_reset(text, text),
  public.security_store_recovery_codes(uuid, text[]),
  public.security_consume_recovery_code(uuid, text),
  public.security_finish_mfa_recovery(uuid, text),
  public.security_purge_expired()
  to service_role;

-- -----------------------------------------------------------------------------
-- S9. MANDATORY MFA ON EVERY TABLE
--     A RESTRICTIVE policy is AND-ed with all permissive policies: signed-in
--     users see/change nothing without an AAL2 session that passes the gate.
--     Re-run this file after adding a table to the public schema.
-- -----------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('drop policy if exists "security: require mfa (aal2)" on public.%I', t.relname);
    execute format(
      'create policy "security: require mfa (aal2)" on public.%I as restrictive for all to authenticated '
      || 'using (((select auth.jwt()) ->> ''aal'') = ''aal2'' and (select public.security_gate())) '
      || 'with check (((select auth.jwt()) ->> ''aal'') = ''aal2'' and (select public.security_gate()))',
      t.relname);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- S10. HOUSEKEEPING JOB (only when pg_cron is enabled)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('security-purge-expired', '17 * * * *',
      'select public.security_purge_expired();');
  end if;
end $$;