const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const { load } = require("./load-typescript.cjs");
const { homepageDefaults, parseHomepageContent, homepageSections, homepageFieldLimit } = load("src/lib/website-content.ts");

test("every homepage field has an editor section and valid defaults", () => {
  assert.deepEqual(parseHomepageContent(homepageDefaults), homepageDefaults);
  assert.deepEqual(Object.values(homepageSections).flat().sort(), Object.keys(homepageDefaults).sort());
});
test("homepage validation rejects missing/extra keys, wrong types and exact length overflow", () => {
  assert.equal(parseHomepageContent(null), null);
  assert.equal(parseHomepageContent({ ...homepageDefaults, extra: "x" }), null);
  assert.equal(parseHomepageContent({ ...homepageDefaults, heroTitle: "" }), null);
  assert.equal(parseHomepageContent({ ...homepageDefaults, heroTitle: 12 }), null);
  for (const key of Object.keys(homepageDefaults)) {
    assert.ok(parseHomepageContent({ ...homepageDefaults, [key]: "a".repeat(homepageFieldLimit(key)) }));
    assert.equal(parseHomepageContent({ ...homepageDefaults, [key]: "a".repeat(homepageFieldLimit(key) + 1) }), null);
  }
});
test("homepage editing remains plain text instead of executable HTML", () => {
  assert.ok(parseHomepageContent({ ...homepageDefaults, heroTitle: "<script>alert(1)</script>" }));
  for (const file of ["Hero", "About", "Testimonials", "Homepage"]) {
    assert.ok(!fs.readFileSync(path.join(root, `src/components/landing/${file}.tsx`), "utf8").includes("dangerouslySetInnerHTML"));
  }
});
const { loadPglite, prepare, PLATFORM } = require("./security/pg-harness.cjs");
const PGlite = loadPglite();
test("homepage migration enforces MFA, teacher role, validation and optimistic concurrency", {
  skip: PGlite ? false : "Set PGLITE_PATH to run database tests",
}, async () => {
  const db = new PGlite();
  try {
    await db.exec(PLATFORM);
    await db.exec(prepare(fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8")));
    const sql = fs.readFileSync(path.join(root, "supabase/website.sql"), "utf8");
    await db.exec(sql);
    await db.exec(sql);
    const one = async (sql, params) => (await db.query(sql, params)).rows[0];
    const teacher = (await one("insert into auth.users (email) values ('teacher@example.com') returning id")).id;
    await db.query("update public.profiles set role='teacher' where id=$1", [teacher]);
    await db.query("insert into auth.mfa_factors(user_id,status) values ($1,'verified')", [teacher]);
    const sid = (await one("insert into auth.sessions(user_id) values($1) returning id", [teacher])).id;
    const claims = { sub: teacher, role: "authenticated", aal: "aal1", session_id: sid, amr: [] };
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
    await db.exec("set role authenticated");
    await db.query("select * from security_session_status()");
    await assert.rejects(db.query("select save_homepage($1,0)", [homepageDefaults]), /NOT_ALLOWED/);
    claims.aal = "aal2";
    claims.amr = [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }];
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify(claims)]);
    await db.query("select * from security_session_status()");
    assert.equal((await one("select save_homepage($1,0) revision", [homepageDefaults])).revision, 1);
    await assert.rejects(db.query("select save_homepage($1,0)", [homepageDefaults]), /CONTENT_CONFLICT/);
    await assert.rejects(db.query("select save_homepage($1,1)", [{ heroTitle: "broken" }]), /INVALID_CONTENT/);
    await db.exec("reset role; set role anon");
    assert.equal((await db.query("select * from website_content")).rows.length, 1);
    await assert.rejects(db.query("update website_content set revision=3"), /permission denied/);
  } finally { await db.close(); }
});
