-- Run AFTER schema.sql and security.sql, before deploying the website editor.
create table if not exists public.website_content (
  id text primary key check (id = 'home'),
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 80000),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.website_content enable row level security;
grant select on public.website_content to anon, authenticated;
revoke insert, update, delete on public.website_content from anon, authenticated;
drop policy if exists "website: public read" on public.website_content;
create policy "website: public read" on public.website_content for select to anon using (true);
drop policy if exists "website: teacher read" on public.website_content;
create policy "website: teacher read" on public.website_content for select to authenticated using (public.is_teacher());
drop policy if exists "security: require mfa (aal2)" on public.website_content;
create policy "security: require mfa (aal2)" on public.website_content as restrictive for all to authenticated
using (public.security_gate()) with check (public.security_gate());

create or replace function public.save_homepage(p_content jsonb, p_revision integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_revision integer;
  v_key text;
  v_limit integer;
  v_keys text[] := array[
    'siteName','teacherName','footerText','heroBadge','heroTitle','heroSubtitle','heroPrimary','heroSecondary',
    'aboutTitle','aboutRole','aboutParagraph1','aboutParagraph2','aboutParagraph3',
    'stat1Value','stat1Label','stat2Value','stat2Label','stat3Value','stat3Label',
    'testimonialsTitle','testimonial1Quote','testimonial1Name','testimonial1Detail',
    'testimonial2Quote','testimonial2Name','testimonial2Detail','testimonial3Quote','testimonial3Name','testimonial3Detail',
    'contactTitle','contactSubtitle','contactName','contactEmail','contactPhone','contactMessage','contactPlaceholder','contactSubmit'
  ];
begin
  if not public.security_gate() or not public.is_teacher() then
    raise exception 'NOT_ALLOWED';
  end if;
  if (select count(*) from jsonb_object_keys(p_content)) <> cardinality(v_keys) then raise exception 'INVALID_CONTENT'; end if;
  foreach v_key in array v_keys loop
    v_limit := case when v_key ~ '(Paragraph|Quote|Subtitle)' then 2000 else 200 end;
    if jsonb_typeof(p_content -> v_key) is distinct from 'string'
      or length(btrim(p_content ->> v_key)) = 0
      or length(p_content ->> v_key) > v_limit then raise exception 'INVALID_CONTENT'; end if;
  end loop;
  if p_content is null or jsonb_typeof(p_content) <> 'object'
    or octet_length(p_content::text) > 80000 or p_revision is null or p_revision < 0 then
    raise exception 'INVALID_CONTENT';
  end if;
  perform pg_advisory_xact_lock(hashtext('website:home'));
  select revision into v_revision from public.website_content where id = 'home' for update;
  if coalesce(v_revision, 0) <> p_revision then raise exception 'CONTENT_CONFLICT'; end if;
  v_revision := coalesce(v_revision, 0) + 1;
  insert into public.website_content (id, content, revision, updated_at)
  values ('home', p_content, v_revision, now())
  on conflict (id) do update set content = excluded.content, revision = excluded.revision, updated_at = now();
  return v_revision;
end;
$$;
revoke all on function public.save_homepage(jsonb, integer) from public, anon;
grant execute on function public.save_homepage(jsonb, integer) to authenticated;
