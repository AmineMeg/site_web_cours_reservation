-- DESTRUCTIVE: deletes ALL contacts, their trials/links, and ALL student messages.
-- Keeps Auth users, profiles, regular lessons, credits, reviews, blog and settings.
-- Back up first. Change the confirmation below only when ready, then run in SQL Editor.
begin;
do $$
declare confirmed boolean := false; contact_count int; message_count int; trial_count int;
begin
  if not confirmed then raise exception 'Set confirmed := true to empty contacts, trials, links and messages'; end if;
  perform pg_advisory_xact_lock(hashtext('public.book_lesson'));
  select count(*) into contact_count from public.contacts;
  select count(*) into message_count from public.messages;
  select count(*) into trial_count from public.trial_bookings;
  delete from public.messages;
  delete from public.trial_bookings;
  delete from public.trial_links;
  delete from public.contacts;
  raise notice 'Deleted % contacts, % trials and % messages. Students and regular lessons were preserved.',
    contact_count, trial_count, message_count;
end;
$$;
commit;
