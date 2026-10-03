const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { File } = require("node:buffer");
const { createLoader, load } = require("./load-typescript.cjs");
const { homepageDefaults, parseHomepageContent, validHomepageImageUrl } = load("src/lib/website-content.ts");
const origin = "https://project.supabase.co";
const filename = "12345678-1234-4123-8123-123456789abc.png";
const url = `${origin}/storage/v1/object/public/homepage-images/${filename}`;
const { heroImage, teacherImage, ...textDefaults } = homepageDefaults;

test("homepage photos preserve old saved texts and accept only this project's uploaded images", () => {
  const old = { ...textDefaults, heroTitle: "My custom title" };
  assert.deepEqual(parseHomepageContent(old), { ...old, heroImage: "", teacherImage: "" });
  assert.equal(parseHomepageContent({ ...old, teacherImage: url }, origin).teacherImage, url);
  for (const bad of [null, 3, "javascript:bad()", "data:image/png;base64,AA", url.replace(origin, "https://elsewhere.test"),
    url.replace("homepage-images", "blog-images"), `${url}?x=1`, `${url}#x`, url.replace(".png", ".svg"),
    url.replace("https://", "https://user@"), `${url}/..`, "a".repeat(501)]) {
    assert.equal(parseHomepageContent({ ...homepageDefaults, heroImage: bad }, origin), null, String(bad));
    assert.equal(validHomepageImageUrl(bad, origin), false);
  }
  assert.equal(parseHomepageContent({ ...homepageDefaults, heroImage: url, teacherImage: url }, origin).heroImage, url);
  const missing = { ...old }; delete missing.heroTitle;
  assert.equal(parseHomepageContent(missing), null);
});

function route(requireTeacher) {
  return createLoader({ "@/lib/auth": { requireTeacher } })("src/app/admin/website/upload/route.ts").POST;
}

test("homepage upload requires teacher authentication and validates origin, size, format and immutable filenames", async () => {
  await assert.rejects(route(async () => { throw new Error("MFA required"); })(new Request("http://localhost", { method: "POST" })), /MFA required/);
  const uploads = [];
  let fail = false;
  const POST = route(async () => ({ supabase: { storage: { from(bucket) {
    assert.equal(bucket, "homepage-images");
    return {
      async upload(name, bytes, options) { uploads.push({ name, bytes, options }); return { error: fail ? { name: "StorageError" } : null }; },
      getPublicUrl(name) { return { data: { publicUrl: `${origin}/storage/v1/object/public/homepage-images/${name}` } }; },
    };
  } } } }));
  const headers = { host: "localhost", origin: "http://localhost" };
  function request(bytes, mime = "image/png") {
    const form = new FormData();
    form.set("file", new File([bytes], "../../unsafe.png", { type: mime }));
    return new Request("http://localhost/admin/website/upload", { method: "POST", headers, body: form });
  }
  assert.equal((await POST(new Request("http://localhost", { method: "POST", headers: { ...headers, origin: "https://evil.test" } }))).status, 403);
  assert.equal((await POST(new Request("http://localhost", { method: "POST", headers: { ...headers, "content-length": "5000000" } }))).status, 413);
  assert.equal((await POST(request(new TextEncoder().encode("<svg/>")))).status, 400);
  assert.equal((await POST(request(new Uint8Array(4 * 1024 * 1024 + 1)))).status, 413);
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]);
  const response = await POST(request(png));
  assert.equal(response.status, 200);
  assert.equal(validHomepageImageUrl((await response.json()).url, origin), true);
  assert.equal(uploads.length, 1);
  assert.match(uploads[0].name, /^[a-f0-9-]{36}\.png$/);
  assert.equal(uploads[0].options.upsert, false);
  fail = true;
  const failure = await POST(request(png));
  assert.equal(failure.status, 400);
  assert.match((await failure.json()).error, /configuração das fotos/);
});

test("homepage save action rejects external images before database access", async () => {
  let calls = 0;
  const action = createLoader({
    "@/lib/auth": { requireTeacher: async () => ({ supabase: { rpc: async (name, args) => {
      calls++; assert.equal(name, "save_homepage"); assert.equal(args.p_content.teacherImage, url);
      return { data: 4, error: null };
    } } }) },
    "@/lib/supabase/env": { supabaseUrl: () => origin },
    "next/cache": { revalidatePath() {} },
  })("src/app/admin/website/actions.ts").saveHomepage;
  assert.equal((await action({ ...homepageDefaults, teacherImage: url.replace(origin, "https://elsewhere.test") }, 3)).ok, false);
  assert.equal(calls, 0);
  assert.deepEqual(await action({ ...homepageDefaults, teacherImage: url }, 3), { ok: true, revision: 4, message: "Sua página inicial foi atualizada." });
  assert.equal(calls, 1);
});

const { loadPglite } = require("./security/pg-harness.cjs");
const PGlite = loadPglite();
test("homepage photo migration preserves custom content, checks revisions and restricts storage writes", {
  skip: PGlite ? false : "Set PGLITE_PATH to run SQL tests",
}, async () => {
  const db = new PGlite();
  const sql = readFileSync(path.resolve(__dirname, "../supabase/homepage-images.sql"), "utf8");
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema storage;
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
    await db.exec(readFileSync(path.resolve(__dirname, "../supabase/website.sql"), "utf8"));
    const custom = { ...textDefaults, heroTitle: "Do not overwrite this title" };
    await db.query("insert into website_content(id,content,revision) values('home',$1,3)", [custom]);
    await db.exec(sql);
    await db.exec(sql);
    const one = async (query, params) => (await db.query(query, params)).rows[0];
    const home = await one("select content,revision from website_content");
    assert.deepEqual(home.content, custom);
    assert.equal(home.revision, 3);
    await db.exec("create policy broad_storage on storage.objects for all to public using (true) with check (true); set role authenticated; set test.teacher='true'; set test.mfa='false'");
    await assert.rejects(db.query("select save_homepage($1,3)", [homepageDefaults]), /NOT_ALLOWED/);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('homepage-images',$1)", [filename]), /row-level security/);
    await db.exec("set test.teacher='false'; set test.mfa='true'");
    await assert.rejects(db.query("select save_homepage($1,3)", [homepageDefaults]), /NOT_ALLOWED/);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('homepage-images',$1)", [filename]), /row-level security/);
    await db.exec("set test.teacher='true'");
    await assert.rejects(db.query("select save_homepage($1,2)", [homepageDefaults]), /CONTENT_CONFLICT/);
    for (const bad of [null, [], { ...homepageDefaults, heroImage: null }, { ...homepageDefaults, heroImage: "javascript:bad()" },
      { ...homepageDefaults, teacherImage: url.replace(".png", ".svg") }, { ...homepageDefaults, extra: "x" }]) {
      await assert.rejects(db.query("select save_homepage($1,3)", [bad]), /INVALID_CONTENT/);
    }
    assert.equal((await one("select save_homepage($1,3) revision", [{ ...custom, heroImage: url, teacherImage: url }])).revision, 4);
    await assert.rejects(db.query("select save_homepage($1,3)", [custom]), /CONTENT_CONFLICT/);
    await db.query("insert into storage.objects(bucket_id,name) values('homepage-images',$1)", [filename]);
    assert.equal((await db.query("update storage.objects set name='new.png' where bucket_id='homepage-images' returning id")).rows.length, 0);
    assert.equal((await db.query("delete from storage.objects where bucket_id='homepage-images' returning id")).rows.length, 0);
    await db.exec("reset role");
    await db.exec(sql);
    assert.equal((await one("select revision from website_content")).revision, 4);
    assert.equal((await one("select content from website_content")).content.teacherImage, url);
    await db.exec("set role anon");
    assert.equal((await one("select content from website_content")).content.heroImage, url);
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('homepage-images',$1)", [filename]), /row-level security/);
    await assert.rejects(db.query("select save_homepage($1,4)", [homepageDefaults]), /permission denied/);
    await db.exec("reset role");
    const bucket = await one("select * from storage.buckets where id='homepage-images'");
    assert.equal(Number(bucket.file_size_limit), 4194304);
    assert.deepEqual(bucket.allowed_mime_types, ["image/png", "image/jpeg", "image/webp"]);
  } finally { await db.close(); }
});
