-- Run after security.sql. Teacher MFA stays mandatory; students use passwords.
-- Existing student authenticator factors and sessions are removed intentionally.
begin;

create or replace function public.security_requires_mfa()
returns boolean language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'student' and is_active
  );
$$;
revoke all on function public.security_requires_mfa() from public, anon;
grant execute on function public.security_requires_mfa() to authenticated;

create or replace function public.security_gate()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and public.security_session_valid()
    and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.is_active
        and (p.role = 'student' or (
          (auth.jwt() ->> 'aal') = 'aal2'
          and public.security_has_verified_totp(auth.uid())
        ))
    ), false);
$$;

create or replace function public.security_has_recent_auth(p_max_age_seconds int default null)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_window int; v_last timestamptz;
begin
  if not public.security_gate() then return false; end if;
  select recent_auth_minutes * 60 into v_window from public.security_settings where id = 1;
  if p_max_age_seconds is not null then v_window := least(v_window, greatest(p_max_age_seconds,30)); end if;
  if public.security_requires_mfa() then
    v_last := public.security_last_totp_at();
  else
    select to_timestamp(max((e ->> 'timestamp')::double precision)) into v_last
    from jsonb_array_elements(case when jsonb_typeof(auth.jwt()->'amr')='array' then auth.jwt()->'amr' else '[]'::jsonb end) e
    where e ->> 'method' = 'password' and (e ->> 'timestamp') ~ '^[0-9]{1,12}(\.[0-9]+)?$';
  end if;
  return v_last is not null and v_last > now()-make_interval(secs=>v_window) and v_last <= now()+interval '1 minute';
end;
$$;

do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    execute format('drop policy if exists "security: require mfa (aal2)" on public.%I', t.relname);
    execute format('create policy "security: require mfa (aal2)" on public.%I as restrictive for all to authenticated using ((select public.security_gate())) with check ((select public.security_gate()))', t.relname);
  end loop;
end $$;

-- Only students are affected, never teacher factors.
delete from auth.mfa_factors f using public.profiles p where f.user_id=p.id and p.role='student';
update public.security_sessions s set ended_at=coalesce(s.ended_at,now()), end_reason='revoked'
from public.profiles p where s.user_id=p.id and p.role='student';
delete from auth.sessions s using public.profiles p where s.user_id=p.id and p.role='student';
delete from public.security_recovery_codes r using public.profiles p where r.user_id=p.id and p.role='student';
commit;
