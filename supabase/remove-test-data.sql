-- Remove ONLY fixtures recorded by seed-test-data.sql, never all student accounts.
-- Back up first. Do not reuse generated demo accounts for real students.
begin;
do $$
declare confirmed_demo boolean := false;
begin
  if not confirmed_demo then raise exception 'Set confirmed_demo := true to remove the recorded demo fixtures'; end if;
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  perform pg_advisory_xact_lock(hashtext('review:emails'));
  if exists(
    select 1 from public.demo_test_fixtures f join auth.users u on u.id=f.id
    join public.profiles p on p.id=u.id where f.kind='student'
      and (p.role<>'student' or u.email not like 'demo-student-%@example.invalid'
        or coalesce(u.encrypted_password,'')<>'' or u.raw_user_meta_data->>'demo_fixture' is distinct from 'true'
        or u.banned_until is distinct from '2099-12-31 23:59:59+00'::timestamptz)
  ) then raise exception 'A demo account was repurposed. Refusing to delete it.'; end if;
  -- Refuse cascading deletion of newly-created, untracked data.
  if exists(select 1 from public.bookings b join public.demo_test_fixtures s on s.kind='student' and s.id=b.student_id
    where not exists(select 1 from public.demo_test_fixtures f where f.kind='booking' and f.id=b.id))
    or exists(select 1 from public.messages m join public.demo_test_fixtures s on s.kind='student' and s.id=m.student_id
      where not exists(select 1 from public.demo_test_fixtures f where f.kind='message' and f.id=m.id))
    or exists(select 1 from public.contacts c join public.demo_test_fixtures s on s.kind='student' and s.id=c.student_id
      where not exists(select 1 from public.demo_test_fixtures f where f.kind='contact' and f.id=c.id))
    or exists(select 1 from public.trial_bookings b join public.demo_test_fixtures s on s.kind='contact' and s.id=b.contact_id
      where not exists(select 1 from public.demo_test_fixtures f where f.kind='trial' and f.id=b.id))
    or exists(select 1 from public.student_reviews r join public.demo_test_fixtures s on s.kind='student' and s.id=r.student_id
      where not exists(select 1 from public.demo_test_fixtures f where f.kind='review' and f.id=r.id))
    or exists(select 1 from public.credit_batches c join public.demo_test_fixtures s on s.kind='student' and s.id=c.student_id
      where not exists(select 1 from public.demo_test_fixtures f where f.kind='credit' and f.id=c.id))
  then raise exception 'Untracked data references demo fixtures. Review it before cleanup.'; end if;
  delete from public.messages where id in(select id from public.demo_test_fixtures where kind='message');
  delete from public.trial_bookings where id in(select id from public.demo_test_fixtures where kind='trial');
  delete from public.contacts where id in(select id from public.demo_test_fixtures where kind='contact');
  delete from public.bookings where id in(select id from public.demo_test_fixtures where kind='booking');
  delete from public.student_reviews where id in(select id from public.demo_test_fixtures where kind='review');
  delete from public.credit_batches where id in(select id from public.demo_test_fixtures where kind='credit');
  delete from public.blog_posts where id in(select id from public.demo_test_fixtures where kind='blog');
  delete from auth.users where id in(select id from public.demo_test_fixtures where kind='student');
  delete from public.demo_test_fixtures;
  raise notice 'Recorded fixtures removed. Administrators, unrelated data and settings were preserved.';
end;
$$;
commit;
