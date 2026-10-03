-- Run after website.sql. Keeps all existing texts and adds optional homepage photos.
begin;

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
    'contactTitle','contactSubtitle','contactName','contactEmail','contactPhone','contactMessage','contactPlaceholder','contactSubmit',
    'heroImage','teacherImage'
  ];
begin
  if not public.security_gate() or not public.is_teacher() then raise exception 'NOT_ALLOWED'; end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object'
    or octet_length(p_content::text) > 80000 or p_revision is null or p_revision < 0 then
    raise exception 'INVALID_CONTENT';
  end if;
  p_content := '{"heroImage":"","teacherImage":""}'::jsonb || p_content;
  if (select count(*) from jsonb_object_keys(p_content)) <> cardinality(v_keys) then raise exception 'INVALID_CONTENT'; end if;
  foreach v_key in array v_keys loop
    if v_key in ('heroImage','teacherImage') then
      if jsonb_typeof(p_content -> v_key) is distinct from 'string'
        or length(p_content ->> v_key) > 500
        or ((p_content ->> v_key) <> '' and (p_content ->> v_key) !~
          '^https?://[^/@?#:]+(:[0-9]+)?/storage/v1/object/public/homepage-images/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$')
        then raise exception 'INVALID_CONTENT'; end if;
    else
      v_limit := case when v_key ~ '(Paragraph|Quote|Subtitle)' then 2000 else 200 end;
      if jsonb_typeof(p_content -> v_key) is distinct from 'string'
        or length(btrim(p_content ->> v_key)) = 0
        or length(p_content ->> v_key) > v_limit then raise exception 'INVALID_CONTENT'; end if;
    end if;
  end loop;
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homepage-images', 'homepage-images', true, 4194304, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "homepage images: public read" on storage.objects;
create policy "homepage images: public read" on storage.objects for select to anon using (bucket_id = 'homepage-images');
drop policy if exists "homepage images: teacher read" on storage.objects;
create policy "homepage images: teacher read" on storage.objects for select to authenticated
using (bucket_id = 'homepage-images' and public.is_teacher());
drop policy if exists "homepage images: teacher uploads" on storage.objects;
create policy "homepage images: teacher uploads" on storage.objects for insert to authenticated
with check (bucket_id = 'homepage-images' and public.is_teacher() and
  name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$');
drop policy if exists "homepage images: enforce teacher mfa" on storage.objects;
create policy "homepage images: enforce teacher mfa" on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'homepage-images' or (public.security_gate() and public.is_teacher()))
with check (bucket_id <> 'homepage-images' or (public.security_gate() and public.is_teacher()));
drop policy if exists "homepage images: no anonymous writes" on storage.objects;
create policy "homepage images: no anonymous writes" on storage.objects as restrictive for insert to anon
with check (bucket_id <> 'homepage-images');
-- Immutable files preserve the published page while an editor changes or discards a draft.
drop policy if exists "homepage images: no updates" on storage.objects;
create policy "homepage images: no updates" on storage.objects as restrictive for update to public
using (bucket_id <> 'homepage-images') with check (bucket_id <> 'homepage-images');
drop policy if exists "homepage images: no deletes" on storage.objects;
create policy "homepage images: no deletes" on storage.objects as restrictive for delete to public
using (bucket_id <> 'homepage-images');
commit;
