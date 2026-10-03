-- Remove the optional demo fixtures and restore the real-student-only endpoint.
-- Run on the same dedicated demo database where demo-reviews.sql was applied.
begin;
create or replace function public.get_public_reviews()
returns table(id uuid, display_name text, quote text)
language sql stable security definer set search_path = public as $$
  select r.id, r.display_name, r.quote from student_reviews r join profiles p on p.id = r.student_id
  where r.status = 'approved' and p.is_active and p.role = 'student'
  order by r.created_at desc, r.id
$$;
revoke all on function public.get_public_reviews() from public;
grant execute on function public.get_public_reviews() to anon, authenticated;
drop table if exists public.demo_student_reviews;
commit;
