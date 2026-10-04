-- Run after trial-and-credit-rules.sql. Keeps trial history and live bookings intact.
begin;
alter table public.contacts add column if not exists archived_at timestamptz;

create or replace function public.remove_contact(p_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
begin
  perform public.security_assert_gate();
  if not public.is_teacher() then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  perform 1 from public.contacts where id = p_id and converted_at is null for update;
  if not found then raise exception 'CONTACT_NOT_FOUND'; end if;
  if exists(select 1 from public.trial_bookings where contact_id = p_id) then
    update public.contacts set archived_at = coalesce(archived_at, now()) where id = p_id;
    return 'archived';
  end if;
  delete from public.contacts where id = p_id;
  return 'deleted';
end;
$$;
create or replace function public.restore_contact(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform public.security_assert_gate();
  if not public.is_teacher() then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  update public.contacts set archived_at = null
    where id = p_id and converted_at is null and archived_at is not null;
  if not found then raise exception 'CONTACT_NOT_FOUND'; end if;
end;
$$;
revoke all on function public.remove_contact(uuid), public.restore_contact(uuid) from public, anon, service_role;
grant execute on function public.remove_contact(uuid), public.restore_contact(uuid) to authenticated;
commit;
