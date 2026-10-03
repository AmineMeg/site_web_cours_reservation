-- Run after schema.sql (or schema.sql + security.sql on upgraded projects).
-- Idempotent standalone blog migration. No service-role client is used by the app.
begin;

create or replace function public.blog_valid_node(node jsonb, parent text default null, depth integer default 0)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare
  kind text;
  child jsonb;
  mark jsonb;
  allowed text[];
begin
  if depth > 12 or jsonb_typeof(node) <> 'object' then return false; end if;
  if exists (select 1 from jsonb_object_keys(node) k where k not in ('type','text','attrs','marks','content')) then return false; end if;
  kind := node->>'type';
  allowed := case
    when parent is null then array['doc']
    when parent = 'doc' then array['paragraph','heading','bulletList','orderedList','image']
    when parent in ('bulletList','orderedList') then array['listItem']
    when parent = 'listItem' then array['paragraph','heading','bulletList','orderedList','image']
    when parent in ('paragraph','heading') then array['text','hardBreak']
    else array[]::text[] end;
  if kind is null or not (kind = any(allowed)) then return false; end if;
  if kind = 'text' then
    if jsonb_typeof(node->'text') is distinct from 'string' or char_length(node->>'text') not between 1 and 100000 then return false; end if;
    if node ? 'marks' then
      if jsonb_typeof(node->'marks') <> 'array' or jsonb_array_length(node->'marks') > 2 then return false; end if;
      for mark in select * from jsonb_array_elements(node->'marks') loop
        if jsonb_typeof(mark) <> 'object' or mark->>'type' is null or mark->>'type' not in ('bold','italic') then return false; end if;
        if exists (select 1 from jsonb_object_keys(mark) k where k <> 'type') then return false; end if;
      end loop;
    end if;
  elsif node ? 'text' or node ? 'marks' then return false;
  end if;
  if kind = 'heading' then
    if jsonb_typeof(node->'attrs') is distinct from 'object' or (node->'attrs'->'level') not in ('2'::jsonb,'3'::jsonb) or not (node->'attrs' ? 'level') then return false; end if;
    if exists (select 1 from jsonb_object_keys(node->'attrs') k where k <> 'level') then return false; end if;
  elsif kind = 'image' then
    if jsonb_typeof(node->'attrs') is distinct from 'object' or jsonb_typeof(node->'attrs'->'src') is distinct from 'string' then return false; end if;
    if node->'attrs'->>'src' !~ '^https?://[^/@?#:]+(:[0-9]+)?/storage/v1/object/public/blog-images/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$' then return false; end if;
    if exists (select 1 from jsonb_object_keys(node->'attrs') k where k not in ('src','alt','title')) then return false; end if;
    foreach kind in array array['alt','title'] loop
      if node->'attrs' ? kind and node->'attrs'->kind <> 'null'::jsonb then
        if jsonb_typeof(node->'attrs'->kind) <> 'string' or char_length(node->'attrs'->>kind) > 300 then return false; end if;
      end if;
    end loop;
    kind := 'image';
  elsif kind = 'orderedList' and node ? 'attrs' then
    if jsonb_typeof(node->'attrs') <> 'object' then return false; end if;
    if exists (select 1 from jsonb_object_keys(node->'attrs') k where k <> 'start') then return false; end if;
    if node->'attrs' ? 'start' and ((node->'attrs'->>'start') !~ '^[0-9]+$' or (node->'attrs'->>'start')::integer not between 1 and 1000) then return false; end if;
  elsif node ? 'attrs' then return false;
  end if;
  if kind in ('text','hardBreak','image') then return not (node ? 'content'); end if;
  if node ? 'content' and jsonb_typeof(node->'content') <> 'array' then return false; end if;
  if kind in ('bulletList','orderedList','listItem') and coalesce(jsonb_array_length(node->'content'),0) = 0 then return false; end if;
  if kind = 'listItem' and node->'content'->0->>'type' is distinct from 'paragraph' then return false; end if;
  for child in select * from jsonb_array_elements(coalesce(node->'content','[]'::jsonb)) loop
    if not public.blog_valid_node(child, kind, depth + 1) then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;

create or replace function public.blog_valid_document(document jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare nodes integer;
begin
  if octet_length(document::text) > 200000 or not public.blog_valid_node(document) then return false; end if;
  with recursive tree(node) as (
    select document
    union all
    select child from tree cross join lateral jsonb_array_elements(coalesce(node->'content','[]'::jsonb)) child
  ) select count(*) into nodes from tree;
  return nodes <= 2000;
end $$;

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 150),
  slug text not null unique check (char_length(slug) between 1 and 100 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  excerpt text not null default '' check (char_length(excerpt) <= 400),
  document jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb check (public.blog_valid_document(document)),
  cover_image text check (cover_image is null or (char_length(cover_image) <= 500 and cover_image ~ '^https?://[^/@?#:]+(:[0-9]+)?/storage/v1/object/public/blog-images/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$')),
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'published' and published_at is not null) or (status = 'draft' and published_at is null))
);
create index if not exists blog_posts_published_idx on public.blog_posts (published_at desc) where status = 'published';

create or replace function public.blog_post_timestamps()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if tg_op = 'UPDATE' then
    if new.slug <> old.slug then raise exception 'Article URL names cannot change'; end if;
    new.created_at := old.created_at;
    new.updated_at := clock_timestamp();
    if new.status = 'published' and old.status = 'published' then new.published_at := old.published_at;
    elsif new.status = 'published' then new.published_at := clock_timestamp();
    else new.published_at := null; end if;
  else
    new.created_at := clock_timestamp();
    new.updated_at := new.created_at;
    new.published_at := case when new.status = 'published' then new.created_at else null end;
  end if;
  return new;
end $$;
drop trigger if exists blog_post_timestamps on public.blog_posts;
create trigger blog_post_timestamps before insert or update on public.blog_posts
for each row execute function public.blog_post_timestamps();
revoke all on function public.blog_post_timestamps() from public, anon, authenticated;

alter table public.blog_posts enable row level security;
revoke all on public.blog_posts from public, anon, authenticated;
grant select on public.blog_posts to anon;
grant select, insert, update, delete on public.blog_posts to authenticated;
drop policy if exists "blog: public published read" on public.blog_posts;
create policy "blog: public published read" on public.blog_posts for select to anon using (status = 'published');
drop policy if exists "blog: teacher manages" on public.blog_posts;
create policy "blog: teacher manages" on public.blog_posts for all to authenticated
using (public.is_teacher()) with check (public.is_teacher());
drop policy if exists "security: require mfa (aal2)" on public.blog_posts;
create policy "security: require mfa (aal2)" on public.blog_posts as restrictive for all to authenticated
using (public.security_gate()) with check (public.security_gate());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-images', 'blog-images', true, 4194304, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "blog images: public read" on storage.objects;
create policy "blog images: public read" on storage.objects for select to anon using (bucket_id = 'blog-images');
drop policy if exists "blog images: teacher read" on storage.objects;
create policy "blog images: teacher read" on storage.objects for select to authenticated
using (bucket_id = 'blog-images' and public.is_teacher());
drop policy if exists "blog images: teacher uploads" on storage.objects;
create policy "blog images: teacher uploads" on storage.objects for insert to authenticated
with check (bucket_id = 'blog-images' and public.is_teacher() and
  name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$');
-- Restrictive policies also constrain any pre-existing, broad storage policies.
-- No updates/deletes for this bucket: changing/removing a shared image could break published posts.
drop policy if exists "blog images: enforce teacher mfa" on storage.objects;
create policy "blog images: enforce teacher mfa" on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'blog-images' or (public.security_gate() and public.is_teacher()))
with check (bucket_id <> 'blog-images' or (public.security_gate() and public.is_teacher()));
drop policy if exists "blog images: no anonymous writes" on storage.objects;
create policy "blog images: no anonymous writes" on storage.objects as restrictive for insert to anon
with check (bucket_id <> 'blog-images');
drop policy if exists "blog images: no updates" on storage.objects;
create policy "blog images: no updates" on storage.objects as restrictive for update to public
using (bucket_id <> 'blog-images') with check (bucket_id <> 'blog-images');
drop policy if exists "blog images: no deletes" on storage.objects;
create policy "blog images: no deletes" on storage.objects as restrictive for delete to public
using (bucket_id <> 'blog-images');
commit;
