-- Run after schema.sql, security.sql and student-password-login.sql.
begin;
create table if not exists public.student_reviews (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  quote text not null check (char_length(btrim(quote)) between 20 and 2000),
  consent_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.review_email_requests (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  sent_at timestamptz,
  attempts integer not null default 0,
  lease_token uuid,
  leased_at timestamptz,
  last_attempt_at timestamptz
);
alter table public.student_reviews enable row level security;
alter table public.review_email_requests enable row level security;
revoke all on public.student_reviews, public.review_email_requests from public, anon, authenticated;
grant select on public.student_reviews to authenticated;
grant all on public.student_reviews, public.review_email_requests to service_role;
drop policy if exists "reviews: own or teacher" on public.student_reviews;
create policy "reviews: own or teacher" on public.student_reviews for select to authenticated
using (public.security_gate() and (public.is_teacher() or student_id = auth.uid()));

create or replace function public.review_eligible(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id=p_student and role='student' and is_active)
    and (select count(*) from bookings where student_id=p_student and status='booked' and ends_at <= now()) >= 5
$$;
revoke all on function public.review_eligible(uuid) from public, anon, authenticated;

create or replace function public.get_my_review_state()
returns table (eligible boolean, has_review boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.security_gate() or public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  return query select public.review_eligible(auth.uid()), exists(select 1 from student_reviews where student_id=auth.uid());
end $$;
revoke all on function public.get_my_review_state() from public, anon;
grant execute on function public.get_my_review_state() to authenticated;

create or replace function public.submit_student_review(p_name text, p_quote text, p_consent boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.security_gate() or public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  if not public.review_eligible(auth.uid()) then raise exception 'NOT_ELIGIBLE'; end if;
  if p_consent is distinct from true or p_name is null or p_quote is null
    or char_length(btrim(p_name)) not between 1 and 80
    or char_length(btrim(p_quote)) not between 20 and 2000 then raise exception 'INVALID_REVIEW'; end if;
  insert into student_reviews(student_id,display_name,quote,consent_at)
    values(auth.uid(),btrim(p_name),btrim(p_quote),clock_timestamp());
end $$;
revoke all on function public.submit_student_review(text,text,boolean) from public, anon;
grant execute on function public.submit_student_review(text,text,boolean) to authenticated;

create or replace function public.withdraw_student_review()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.security_gate() or public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  update student_reviews set status='withdrawn',updated_at=clock_timestamp() where student_id=auth.uid() and status<>'withdrawn';
  if not found then raise exception 'REVIEW_CONFLICT'; end if;
end $$;
revoke all on function public.withdraw_student_review() from public, anon;
grant execute on function public.withdraw_student_review() to authenticated;

create or replace function public.moderate_student_review(p_id uuid,p_status text,p_updated_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.security_gate() or not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  if p_status is null or p_status not in ('approved','rejected') then raise exception 'INVALID_REVIEW'; end if;
  update student_reviews set status=p_status,updated_at=clock_timestamp()
    where id=p_id and updated_at=p_updated_at and status<>'withdrawn';
  if not found then raise exception 'REVIEW_CONFLICT'; end if;
end $$;
revoke all on function public.moderate_student_review(uuid,text,timestamptz) from public, anon;
grant execute on function public.moderate_student_review(uuid,text,timestamptz) to authenticated;

create or replace function public.get_public_reviews()
returns table(id uuid,display_name text,quote text)
language sql stable security definer set search_path = public as $$
  select r.id,r.display_name,r.quote from student_reviews r join profiles p on p.id=r.student_id
  where r.status='approved' and p.is_active and p.role='student' order by r.created_at desc,r.id
$$;
revoke all on function public.get_public_reviews() from public;
grant execute on function public.get_public_reviews() to anon,authenticated;

-- Queue/lease endpoints are service-role-only. Failed sends retry on the next daily run.
create or replace function public.claim_review_emails()
returns table(student_id uuid,email text,full_name text,lease_token uuid)
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('review:emails'));
  insert into review_email_requests(student_id)
    select p.id from profiles p where p.role='student' and p.is_active
      and public.review_eligible(p.id) and not exists(select 1 from student_reviews r where r.student_id=p.id)
    on conflict do nothing;
  return query
    with candidates as (
      select q.student_id from review_email_requests q join profiles p on p.id=q.student_id
      where q.sent_at is null and (q.leased_at is null or q.leased_at<now()-interval '10 minutes')
        and (q.last_attempt_at is null or q.last_attempt_at<now()-interval '20 hours')
        and public.review_eligible(p.id) and not exists(select 1 from student_reviews r where r.student_id=p.id)
      order by q.last_attempt_at nulls first,q.student_id limit 10 for update of q skip locked
    ), claimed as (
      update review_email_requests q set lease_token=gen_random_uuid(),leased_at=clock_timestamp(),
        attempts=attempts+1,last_attempt_at=clock_timestamp()
      from candidates c where q.student_id=c.student_id returning q.student_id,q.lease_token
    )
    select c.student_id,p.email,p.full_name,c.lease_token from claimed c join profiles p on p.id=c.student_id;
end $$;
create or replace function public.finish_review_email(p_student uuid,p_lease uuid,p_sent boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update review_email_requests set sent_at=case when p_sent then clock_timestamp() else sent_at end,
    leased_at=null,lease_token=null where student_id=p_student and lease_token=p_lease;
  if not found then raise exception 'EMAIL_LEASE_CONFLICT'; end if;
end $$;
revoke all on function public.claim_review_emails(),public.finish_review_email(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_review_emails(),public.finish_review_email(uuid,uuid,boolean) to service_role;
commit;
