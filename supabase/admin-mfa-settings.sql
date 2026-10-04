-- Run after student-password-login.sql and all feature migrations.
-- Defaults preserve mandatory MFA for every administrator.
begin;

create table if not exists public.admin_mfa_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.admin_mfa_settings enable row level security;
revoke all on public.admin_mfa_settings from public, anon, authenticated, service_role;

create or replace function public.security_requires_mfa()
returns boolean language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles p left join public.admin_mfa_settings m on m.user_id = p.id
    where p.id = auth.uid() and p.is_active
      and (p.role = 'student' or (p.role = 'teacher' and m.enabled = false))
  )
$$;
create or replace function public.security_gate()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null and public.security_session_valid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
    and (not public.security_requires_mfa() or (
      (auth.jwt() ->> 'aal') = 'aal2' and public.security_has_verified_totp(auth.uid())
    )), false)
$$;

-- The server confirms the caller's password and existing MFA before invoking this.
-- No caller-supplied target ID is accepted by the server action.
create or replace function public.set_admin_mfa(p_user_id uuid, p_enabled boolean, p_expected boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare current_enabled boolean;
begin
  if p_enabled is null or p_expected is null then raise exception 'INVALID_MFA_SETTING'; end if;
  perform 1 from public.profiles where id = p_user_id and role = 'teacher' and is_active for update;
  if not found then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  select enabled into current_enabled from public.admin_mfa_settings where user_id = p_user_id for update;
  current_enabled := coalesce(current_enabled, true);
  if current_enabled <> p_expected then raise exception 'MFA_SETTING_CHANGED'; end if;
  insert into public.admin_mfa_settings(user_id, enabled)
  values(p_user_id, p_enabled)
  on conflict(user_id) do update set enabled = excluded.enabled, updated_at = now();
  perform public.security_log_event(
    case when p_enabled then 'mfa.requirement_enabled' else 'mfa.requirement_disabled' end,
    p_user_id, jsonb_build_object('enabled', p_enabled), p_user_id);
end;
$$;
revoke all on function public.set_admin_mfa(uuid,boolean,boolean) from public, anon, authenticated;
grant execute on function public.set_admin_mfa(uuid,boolean,boolean) to service_role;
revoke all on function public.security_requires_mfa() from public, anon;
grant execute on function public.security_requires_mfa() to authenticated;
commit;
