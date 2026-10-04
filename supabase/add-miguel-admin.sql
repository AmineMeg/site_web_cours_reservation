-- First create this user in Supabase Authentication, then run admin-mfa-settings.sql.
-- Passwords belong in Supabase Auth, never in SQL files or Git.
begin;
do $$
declare target_id uuid;
begin
  select id into target_id from auth.users where lower(email) = 'miguelares1@hotmail.com';
  if target_id is null then raise exception 'Create the account in Supabase Authentication first'; end if;
  update public.profiles set role = 'teacher', is_active = true, full_name = 'Miguel'
    where id = target_id;
  if not found then raise exception 'Account profile not found'; end if;
  -- Disable MFA initially only; rerunning never disables MFA that was reactivated.
  insert into public.admin_mfa_settings(user_id, enabled) values(target_id, false)
    on conflict(user_id) do nothing;
end;
$$;
commit;
