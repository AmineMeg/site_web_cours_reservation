const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { loadPglite, prepare, PLATFORM } = require("./security/pg-harness.cjs");
const PGlite = loadPglite();
const sql = (file) => readFileSync(path.join(__dirname, "..", "supabase", file), "utf8");
const confirmed = (file) => sql(file).replace(/(confirmed(?:_demo)? boolean := )false;/, "$1true;");

test("demo seed, cleanup safety, real schema constraints and exact scenario counts", {
  skip: PGlite ? false : "Set PGLITE_PATH for SQL tests",
}, async (t) => {
  const db = new PGlite();
  const one = async (query, params = []) => (await db.query(query, params)).rows[0];
  const count = async (table, where = "true") => (await one(`select count(*)::int n from ${table} where ${where}`)).n;
  const fails = async (source, pattern) => {
    await assert.rejects(db.exec(source), pattern);
    await db.exec("rollback");
  };
  try {
    await db.exec(PLATFORM);
    await db.exec(`
      alter table auth.users add column encrypted_password text, add column email_confirmed_at timestamptz, add column banned_until timestamptz;
      create schema storage;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
    `);
    for (const file of ["schema.sql", "student-password-login.sql", "website.sql", "teacher-booking.sql", "student-reviews.sql",
      "trial-and-credit-rules.sql", "public-trial-booking.sql", "admin-removal.sql", "admin-mfa-settings.sql", "blog.sql"]) {
      await db.exec(prepare(sql(file)));
    }
    const teacher = (await one("insert into auth.users(email) values('existing-admin@example.invalid') returning id")).id;
    const student = (await one("insert into auth.users(email) values('existing-student@example.invalid') returning id")).id;
    await db.query("update profiles set role='teacher' where id=$1", [teacher]);
    const booking = (await one(`insert into bookings(student_id,starts_at,ends_at,credits_used)
      values($1,now()-interval '200 days',now()-interval '200 days'+interval '1 hour',0) returning id`, [student])).id;
    const settings = await one("select * from app_settings");
    const hours = (await db.query("select * from weekly_availability order by weekday")).rows;

    await t.test("default guards stop every destructive script before any persistent changes", async () => {
      for (const file of ["empty-contacts-and-messages.sql", "seed-test-data.sql", "remove-test-data.sql"]) {
        await fails(sql(file), /Set confirmed/);
      }
      assert.equal(await count("profiles"), 2);
      assert.equal((await one("select to_regclass('public.demo_test_fixtures') as name")).name, null);
    });

    await t.test("insufficient availability rolls the whole seed back", async () => {
      await db.exec("update weekly_availability set is_active=false");
      await fails(confirmed("seed-test-data.sql"), /Not enough availability/);
      assert.equal(await count("profiles"), 2);
      assert.equal(await count("contacts"), 0);
      await db.exec("update weekly_availability set is_active=(weekday between 1 and 5)");
    });

    await t.test("exact counts, login restrictions, credit consistency and correct public filtering", async () => {
      await db.exec(confirmed("seed-test-data.sql"));
      assert.equal(await count("contacts"), 20);
      assert.equal(await count("profiles", "email like 'demo-student-%@example.invalid'"), 10);
      assert.equal(await count("auth.users", "email like 'demo-student-%@example.invalid' and coalesce(encrypted_password,'')='' and email_confirmed_at is null and banned_until='2099-12-31 23:59:59+00'"), 10);
      assert.equal(await count("student_reviews"), 7);
      assert.equal(await count("student_reviews", "status='pending'"), 3);
      assert.equal(await count("student_reviews", "status='approved'"), 4);
      assert.equal((await db.query("select * from get_public_reviews()")).rows.length, 4);
      assert.equal(await count("student_reviews", "not review_eligible(student_id)"), 0);
      assert.equal((await db.query("select * from claim_review_emails()")).rows.length, 0);
      assert.equal(await count("blog_posts"), 3);
      assert.equal(await count("blog_posts", "status='published' and published_at is not null"), 2);
      assert.equal(await count("blog_posts", "status='draft' and published_at is null"), 1);
      for (const article of (await db.query("select * from blog_posts order by slug")).rows) {
        const nodes = article.document.content;
        const text = nodes.flatMap(node => node.content || []).map(node => node.text || "").join(" ");
        assert.ok(text.trim().split(/\s+/u).length >= 500, `${article.slug} must contain at least 500 words`);
        assert.equal(nodes.filter(node => node.type === "heading").length, 4);
        assert.equal(nodes.filter(node => node.type === "paragraph").length, 12);
        assert.match(text, /aula|professora/u);
        assert.doesNotMatch(article.title + " " + text, /TESTE|demonstração|fictíci/iu);
      }
      assert.equal((await one("select full_name from profiles where email='demo-student-1@example.invalid'")).full_name, "Ana Carolina Silva");
      assert.equal((await one("select name from contacts where email='demo-contact-1@example.invalid'")).name, "Fernanda Souza");
      assert.equal(await count("student_reviews", "quote like '%TESTE%' or display_name like '%TESTE%'"), 0);
      assert.equal((await one("select count(distinct quote)::int n from student_reviews")).n, 7);
      assert.equal(await count("messages"), 12);
      assert.equal(await count("trial_bookings"), 14);
      assert.equal(await count("trial_bookings", "status='booked' and starts_at>now()"), 5);
      assert.equal(await count("trial_bookings", "status='cancelled'"), 3);
      assert.equal(await count("contacts", "archived_at is not null"), 2);
      assert.equal(await count("contacts", "converted_at is not null"), 1);
      assert.equal(await count("bookings", "status='booked' and starts_at>now()"), 8);
      assert.equal(await count("bookings", "status='booked' and starts_at>now() and credits_used=0"), 1);
      assert.equal(await count("bookings", "status='cancelled'"), 10);
      assert.equal(await count("bookings"), 58); // 57 fixtures plus the preexisting lesson.
      assert.equal(await count("bookings", "status='booked' and ends_at<=now()"), 40);
      assert.equal(await count("bookings", "credits_used=1 and credit_batch_id is null"), 0);
      assert.equal(await count("profiles p", "p.credits<>(select coalesce(sum(c.remaining),0) from credit_batches c where c.student_id=p.id and c.expires_at>now())"), 0);
      assert.equal(await count("credit_batches", "expires_at<now() and remaining>0"), 1);
      const overlap = await one(`with slots as (
        select id,starts_at,ends_at from bookings where status='booked'
        union all select id,starts_at,ends_at from trial_bookings where status='booked'
      ) select count(*)::int n from slots a join slots b on a.id<b.id and a.starts_at<b.ends_at and b.starts_at<a.ends_at`);
      assert.equal(overlap.n, 0);
      assert.equal(await count("trial_bookings", "ends_at<>starts_at+interval '30 minutes'"), 0);
      const tokenHash = (await one("select token_hash from trial_links join contacts on contacts.id=contact_id where email='demo-contact-6@example.invalid'")).token_hash;
      const context = (await one("select trial_context($1) data", [tokenHash])).data;
      assert.equal(context.contact.email, "demo-contact-6@example.invalid");
      assert.ok(context.booking);
      assert.deepEqual(await one("select * from app_settings"), settings);
      await db.exec("set role anon");
      assert.equal(await count("blog_posts"), 2);
      assert.equal((await db.query("select * from get_public_reviews()")).rows.length, 4);
      await assert.rejects(db.query("select * from demo_test_fixtures"), /permission denied/);
      await db.exec("reset role");
    });

    await t.test("article-only refresh preserves other fixtures, URLs, publication states and dates", async () => {
      const source = confirmed("seed-test-data.sql").replace("refresh_articles boolean := false;", "refresh_articles boolean := true;");
      const existing = (await one("select id from blog_posts where slug='demo-test-article-1'")).id;
      const missing = (await one("select id from blog_posts where slug='demo-test-article-3'")).id;
      await db.query("delete from demo_test_fixtures where kind='blog' and id=$1", [missing]);
      await fails(source, /Expected all three tracked demo articles/);
      await db.query("insert into demo_test_fixtures(kind,id) values('blog',$1)", [missing]);
      await db.query("update blog_posts set title='Old short article',status='draft' where id=$1", [existing]);
      const sentinel = (await one("insert into blog_posts(title,slug) values('Unrelated draft','refresh-sentinel') returning *"));
      const oldArticles = (await db.query("select id,slug,status,created_at,published_at from blog_posts order by slug")).rows;
      const before = {};
      for (const table of ["profiles", "bookings", "trial_bookings", "contacts", "messages", "credit_batches", "student_reviews", "demo_test_fixtures"]) {
        before[table] = (await db.query(`select * from ${table} order by ${table === "demo_test_fixtures" ? "kind,id" : "id"}`)).rows;
      }
      await db.exec(source);
      assert.deepEqual((await db.query("select id,slug,status,created_at,published_at from blog_posts order by slug")).rows, oldArticles);
      assert.deepEqual(await one("select * from blog_posts where id=$1", [sentinel.id]), sentinel);
      assert.match((await one("select title from blog_posts where id=$1", [existing])).title, /Espanhol para viajar/u);
      for (const [table, rows] of Object.entries(before)) {
        assert.deepEqual((await db.query(`select * from ${table} order by ${table === "demo_test_fixtures" ? "kind,id" : "id"}`)).rows, rows, table);
      }
      await db.query("delete from blog_posts where id=$1", [sentinel.id]);
    });

    await t.test("demo presentation refresh replaces legacy labels without changing schedules, balances, statuses or unrelated rows", async () => {
      const source = confirmed("seed-test-data.sql").replace("refresh_demo_presentation boolean := false;", "refresh_demo_presentation boolean := true;");
      await db.exec(`
        update profiles set full_name='[TESTE] Ana',objectives='[TESTE] Praticar conversação',
          teacher_notes='Dados fictícios. Sem senha, sem acesso e sem telefone real.'
          where id='d3100000-0000-4000-8000-000000000001';
        update contacts set name='[TESTE] Contato 01',message='[TESTE] Quero aprender'
          where email='demo-contact-1@example.invalid';
        update messages set body='[MENSAGEM DE TESTE 1] Minha dúvida';
        update student_reviews set display_name='[TESTE] Aluno',quote='[AVALIAÇÃO FICTÍCIA DE TESTE] As aulas são acolhedoras.';
        update bookings set cancel_message='[TESTE] Cancelamento para verificar o histórico.' where status='cancelled';
        update trial_bookings set cancel_message='[TESTE] Ensaio cancelado.' where status='cancelled';
        update blog_posts set title='[TESTE] '||title;
      `);
      const sentinel = (await one("insert into contacts(name,email,message) values('[TESTE] Do not touch','presentation-sentinel@example.invalid','[TESTE] Preserve') returning *"));
      const before = {};
      for (const table of ["credit_batches", "demo_test_fixtures"]) {
        before[table] = (await db.query(`select * from ${table} order by ${table === "demo_test_fixtures" ? "kind,id" : "id"}`)).rows;
      }
      const lessons = (await db.query("select id,student_id,starts_at,ends_at,status,credit_batch_id,credits_used from bookings order by id")).rows;
      const trials = (await db.query("select id,contact_id,starts_at,ends_at,status from trial_bookings order by id")).rows;
      const reviews = (await db.query("select id,student_id,status,consent_at from student_reviews order by id")).rows;
      const articles = (await db.query("select id,slug,status,created_at,published_at,document from blog_posts order by id")).rows;
      await db.exec("update profiles set role='teacher' where id='d3100000-0000-4000-8000-000000000001'");
      await fails(source, /repurposed/);
      await db.exec("update profiles set role='student' where id='d3100000-0000-4000-8000-000000000001'");
      await db.exec(source);
      for (const [table, rows] of Object.entries(before)) {
        assert.deepEqual((await db.query(`select * from ${table} order by ${table === "demo_test_fixtures" ? "kind,id" : "id"}`)).rows, rows);
      }
      assert.deepEqual((await db.query("select id,student_id,starts_at,ends_at,status,credit_batch_id,credits_used from bookings order by id")).rows, lessons);
      assert.deepEqual((await db.query("select id,contact_id,starts_at,ends_at,status from trial_bookings order by id")).rows, trials);
      assert.deepEqual((await db.query("select id,student_id,status,consent_at from student_reviews order by id")).rows, reviews);
      assert.deepEqual((await db.query("select id,slug,status,created_at,published_at,document from blog_posts order by id")).rows, articles);
      assert.deepEqual(await one("select * from contacts where id=$1", [sentinel.id]), sentinel);
      assert.equal((await one("select full_name from profiles where id='d3100000-0000-4000-8000-000000000001'")).full_name, "Ana Carolina Silva");
      assert.equal((await one("select raw_user_meta_data->>'full_name' name from auth.users where id='d3100000-0000-4000-8000-000000000001'")).name, "Ana Carolina Silva");
      assert.equal(await count("student_reviews", "display_name like '%TESTE%' or quote like '%TESTE%'"), 0);
      assert.equal(await count("messages", "body like '%TESTE%'"), 0);
      assert.equal(await count("blog_posts", "title like '%TESTE%'"), 0);
      assert.equal((await one("select name from contacts where email='demo-contact-1@example.invalid'")).name, "Fernanda Souza");
      await db.query("delete from contacts where id=$1", [sentinel.id]);
      await db.exec(`update blog_posts set document=jsonb_set(document,'{content}',
        jsonb_build_array(jsonb_build_object('type','paragraph','content',jsonb_build_array(
          jsonb_build_object('type','text','text','Artigo de demonstração para testar o blog e preparar atividades de espanhol.'))))
        || (document->'content'))`);
      await db.exec(source);
      assert.deepEqual((await db.query("select id,slug,status,created_at,published_at,document from blog_posts order by id")).rows, articles);
      await db.exec(source.replace("refresh_articles boolean := false;", "refresh_articles boolean := true;"));
      assert.deepEqual((await db.query("select id,slug,status,created_at,published_at,document from blog_posts order by id")).rows, articles);
    });

    await t.test("reruns preserve edits, IDs and dates, and fixture removal keeps unrelated records", async () => {
      const before = (await db.query("select kind,id from demo_test_fixtures order by kind,id")).rows;
      await db.exec("update contacts set message='Edited in the admin' where email='demo-contact-1@example.invalid'");
      await db.exec(confirmed("seed-test-data.sql"));
      assert.deepEqual((await db.query("select kind,id from demo_test_fixtures order by kind,id")).rows, before);
      assert.equal((await one("select message from contacts where email='demo-contact-1@example.invalid'")).message, "Edited in the admin");
      const sentinelContact = (await one("insert into contacts(name,email) values('Unrelated contact','unrelated@example.invalid') returning id")).id;
      const sentinelBlog = (await one("insert into blog_posts(title,slug) values('Unrelated draft','unrelated-draft') returning id")).id;
      const sentinelMessage = (await one("insert into messages(student_id,body) values($1,'Unrelated message') returning id", [student])).id;
      const sentinelCredit = (await one("insert into credit_batches(student_id,remaining,expires_at) values($1,2,now()+interval '1 year') returning id", [student])).id;
      await db.query("select sync_credit_balance($1)", [student]);
      await db.exec(confirmed("remove-test-data.sql"));
      assert.equal(await count("profiles"), 2);
      assert.equal(await count("auth.users"), 2);
      for (const table of ["trial_bookings", "trial_links", "student_reviews", "demo_test_fixtures"]) {
        assert.equal(await count(table), 0, table);
      }
      assert.equal((await one("select id from contacts")).id, sentinelContact);
      assert.equal((await one("select id from blog_posts")).id, sentinelBlog);
      assert.equal((await one("select id from messages")).id, sentinelMessage);
      assert.equal((await one("select id from credit_batches")).id, sentinelCredit);
      await db.exec("delete from contacts; delete from blog_posts; delete from messages; delete from credit_batches");
      await db.query("select sync_credit_balance($1)", [student]);
      assert.equal((await one("select id from bookings")).id, booking);
      assert.deepEqual(await one("select * from app_settings"), settings);
      assert.deepEqual((await db.query("select * from weekly_availability order by weekday")).rows, hours);
    });

    await t.test("seed refuses preexisting Auth collisions without replacing users", async () => {
      await db.exec("insert into auth.users(email) values('demo-student-1@example.invalid')");
      await fails(confirmed("seed-test-data.sql"), /DEMO_USER_COLLISION/);
      assert.equal(await count("profiles"), 3);
      await db.exec("delete from auth.users where email='demo-student-1@example.invalid'");
    });

    await t.test("cleanup refuses repurposed accounts and newly created dependent data", async () => {
      await db.exec(confirmed("seed-test-data.sql"));
      await db.exec("update profiles set role='teacher' where id='d3100000-0000-4000-8000-000000000001'");
      await fails(confirmed("remove-test-data.sql"), /repurposed/);
      assert.equal(await count("contacts"), 20);
      await db.exec("update profiles set role='student' where id='d3100000-0000-4000-8000-000000000001'");
      const added = (await one(`insert into messages(student_id,body) values('d3100000-0000-4000-8000-000000000001','New test message') returning id`)).id;
      await fails(confirmed("remove-test-data.sql"), /Untracked data/);
      await db.query("delete from messages where id=$1", [added]);
    });

    await t.test("full contacts/messages purge preserves ALL accounts and regular lesson/credit/content data", async () => {
      const before = {};
      for (const table of ["auth.users", "profiles", "bookings", "credit_batches", "student_reviews", "blog_posts"]) {
        before[table] = (await db.query(`select * from ${table} order by id`)).rows;
      }
      assert.equal((await one("select delete_old_contacts() n")).n, 1);
      await db.exec(confirmed("empty-contacts-and-messages.sql"));
      for (const table of ["contacts", "trial_bookings", "trial_links", "messages"]) assert.equal(await count(table), 0, table);
      for (const [table, rows] of Object.entries(before)) assert.deepEqual((await db.query(`select * from ${table} order by id`)).rows, rows, table);
      await db.exec(confirmed("empty-contacts-and-messages.sql"));
      await db.exec(confirmed("remove-test-data.sql"));
      assert.equal(await count("profiles"), 2);
      await db.exec(confirmed("seed-test-data.sql"));
      assert.equal(await count("contacts"), 20);
    });
  } finally { await db.close(); }
});
