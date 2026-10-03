const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { load } = require("./load-typescript.cjs");
const { loadPglite, prepare, PLATFORM } = require("./security/pg-harness.cjs");
const PGlite = loadPglite();
const root = path.resolve(__dirname, "..");

test("optional demo fixtures display three reviews, preserve real data and cleanly restore the public endpoint", {
  skip: PGlite ? false : "Set PGLITE_PATH to run demo database tests",
}, async () => {
  const db = new PGlite();
  try {
    await db.exec(PLATFORM);
    await db.exec(prepare(fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8")));
    await db.exec(fs.readFileSync(path.join(root, "supabase/student-reviews.sql"), "utf8"));
    const pupil = (await db.query("insert into auth.users(email) values('existing@example.test') returning id")).rows[0].id;
    await db.query(`insert into student_reviews(student_id,display_name,quote,consent_at,status)
      values($1,'Existing pupil','This is an existing approved student review.',now(),'approved')`, [pupil]);
    const realBefore = (await db.query("select * from student_reviews")).rows;
    const seed = fs.readFileSync(path.join(root, "supabase/demo-reviews.sql"), "utf8");
    await db.exec(seed);
    await db.exec(seed);
    assert.deepEqual((await db.query("select * from student_reviews")).rows, realBefore);
    assert.equal((await db.query("select count(*)::int n from auth.users")).rows[0].n, 1);
    assert.equal((await db.query("select count(*)::int n from review_email_requests")).rows[0].n, 0);
    await db.exec("set role anon");
    const reviews = (await db.query("select * from get_public_reviews()")).rows;
    assert.equal(reviews.length, 4);
    assert.deepEqual(Object.keys(reviews[0]).sort(), ["id", "display_name", "quote"].sort());
    await assert.rejects(db.query("select * from demo_student_reviews"), /permission denied/);
    await assert.rejects(db.query("insert into demo_student_reviews values(gen_random_uuid(),'X','Unauthorized testimonial text',now())"), /permission denied/);
    const { Testimonials } = load("src/components/landing/Testimonials.tsx");
    const { homepageDefaults } = load("src/lib/website-content.ts");
    const html = renderToStaticMarkup(React.createElement(Testimonials, { content: homepageDefaults, reviews }));
    for (const name of ["Ana", "Lucas", "Beatriz", "Existing pupil"]) assert.ok(html.includes(name));
    assert.equal((html.match(/<blockquote/g) || []).length, 4);
    assert.doesNotMatch(html, /demonstração|★★★★★/);
    await db.exec("reset role; set role authenticated");
    assert.equal((await db.query("select * from get_public_reviews()")).rows.length, 4);
    await assert.rejects(db.query("delete from demo_student_reviews"), /permission denied/);
    await db.exec("reset role");
    const cleanup = fs.readFileSync(path.join(root, "supabase/remove-demo-reviews.sql"), "utf8");
    await db.exec(cleanup);
    await db.exec(cleanup);
    await db.exec("set role anon");
    assert.deepEqual((await db.query("select * from get_public_reviews()")).rows.map(r => r.display_name), ["Existing pupil"]);
    await db.exec("reset role");
    assert.deepEqual((await db.query("select * from student_reviews")).rows, realBefore);
    assert.equal((await db.query("select to_regclass('public.demo_student_reviews') present")).rows[0].present, null);
  } finally { await db.close(); }
});
