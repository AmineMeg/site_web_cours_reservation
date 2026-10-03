const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
let PGlite;
try { ({ PGlite } = require(process.env.BLOG_PGLITE_PATH || "@electric-sql/pglite")); } catch {}

test("blog standalone migration: validation, timestamps, RLS and storage safeguards", { skip: !PGlite && "Set BLOG_PGLITE_PATH to the installed @electric-sql/pglite module." }, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant usage on schema public, storage to anon, authenticated;
      grant all on storage.objects to anon, authenticated;
      create function public.is_teacher() returns boolean language sql as $$
        select coalesce(current_setting('test.teacher',true),'false') = 'true'
      $$;
      create function public.security_gate() returns boolean language sql as $$
        select coalesce(current_setting('test.mfa',true),'false') = 'true'
      $$;
    `);
    const migration = readFileSync(path.resolve(__dirname, "../supabase/blog.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(`
      insert into public.blog_posts (title,slug,status) values ('Draft','draft','draft'), ('Public','public','published');
      create policy broad_storage on storage.objects for all to public using (true) with check (true);
    `);
    assert.equal((await db.query("select count(*)::int n from blog_posts where status='published' and published_at is not null")).rows[0].n, 1);
    await assert.rejects(db.exec("update blog_posts set slug='changed' where slug='public'"), /cannot change/);
    await assert.rejects(db.exec(`insert into blog_posts(title,slug,document) values('Bad','bad','{"type":"doc","content":[{"type":"script"}]}')`), /check constraint/);
    await assert.rejects(db.exec(`insert into blog_posts(title,slug,document) values('Bad','bad','{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"link","marks":[{"type":"link"}]}]}]}')`), /check constraint/);
    await db.exec("set role anon");
    assert.deepEqual((await db.query("select slug from blog_posts")).rows.map(r => r.slug), ["public"]);
    await assert.rejects(db.exec("insert into blog_posts(title,slug) values('No','no')"), /permission denied/);
    await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('blog-images','12345678-1234-4123-8123-123456789abc.png')"), /row-level security/);
    await db.exec("reset role; set role authenticated; set test.teacher='true'; set test.mfa='false'");
    assert.equal((await db.query("select count(*)::int n from blog_posts")).rows[0].n, 0);
    await assert.rejects(db.exec("insert into blog_posts(title,slug) values('No','no')"), /row-level security/);
    await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('blog-images','12345678-1234-4123-8123-123456789abc.png')"), /row-level security/);
    await db.exec("set test.teacher='false'; set test.mfa='true'");
    assert.equal((await db.query("select count(*)::int n from blog_posts")).rows[0].n, 0);
    await assert.rejects(db.exec("insert into blog_posts(title,slug) values('No','no')"), /row-level security/);
    await assert.rejects(db.exec("insert into storage.objects(bucket_id,name) values('blog-images','12345678-1234-4123-8123-123456789abc.png')"), /row-level security/);
    await db.exec("set test.teacher='true'");
    assert.equal((await db.query("select count(*)::int n from blog_posts")).rows[0].n, 2);
    await db.exec("update blog_posts set status='published' where slug='draft'");
    assert.equal((await db.query("select published_at is not null present from blog_posts where slug='draft'")).rows[0].present, true);
    await db.exec("update blog_posts set status='draft' where slug='draft'");
    assert.equal((await db.query("select published_at is null absent from blog_posts where slug='draft'")).rows[0].absent, true);
    await db.exec("insert into storage.objects(bucket_id,name) values('blog-images','12345678-1234-4123-8123-123456789abc.png')");
    assert.equal((await db.query("update storage.objects set name='overwrite.png' where bucket_id='blog-images' returning id")).rows.length, 0);
    assert.equal((await db.query("delete from storage.objects where bucket_id='blog-images' returning id")).rows.length, 0);
    await db.exec("delete from blog_posts where slug='draft'; reset role; set role anon");
    assert.deepEqual((await db.query("select slug from blog_posts")).rows.map(r => r.slug), ["public"]);
    assert.equal((await db.query("delete from storage.objects where bucket_id='blog-images' returning id")).rows.length, 0);
    await db.exec("reset role");
    const bucket = (await db.query("select * from storage.buckets where id='blog-images'")).rows[0];
    assert.equal(bucket.public, true);
    assert.equal(Number(bucket.file_size_limit), 4194304);
    assert.deepEqual(bucket.allowed_mime_types, ["image/png", "image/jpeg", "image/webp"]);
  } finally { await db.close(); }
});
