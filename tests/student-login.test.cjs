const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadPglite, prepare, PLATFORM } = require("./security/pg-harness.cjs");
const PGlite = loadPglite();
const root = path.resolve(__dirname, "..");

test("students sign in without MFA while teacher data/actions still require MFA", {
  skip: PGlite ? false : "Set PGLITE_PATH to run database tests",
}, async () => {
  const db = new PGlite();
  try {
    await db.exec(PLATFORM);
    await db.exec(prepare(fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8")));
    const one = async (sql, params) => (await db.query(sql, params)).rows[0];
    const student = (await one("insert into auth.users(email) values('student@test.com') returning id")).id;
    const teacher = (await one("insert into auth.users(email) values('teacher@test.com') returning id")).id;
    await db.query("update public.profiles set role='teacher' where id=$1", [teacher]);
    await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified'),($2,'verified')", [student, teacher]);
    const oldSession = (await one("insert into auth.sessions(user_id) values($1) returning id", [student])).id;
    const migration = fs.readFileSync(path.join(root, "supabase/student-password-login.sql"), "utf8");
    await db.exec(migration);
    await db.exec(migration);
    assert.equal((await one("select count(*)::int n from auth.mfa_factors where user_id=$1", [student])).n, 0);
    assert.equal((await one("select count(*)::int n from auth.mfa_factors where user_id=$1", [teacher])).n, 1);
    assert.equal((await one("select count(*)::int n from auth.sessions where id=$1", [oldSession])).n, 0);
    async function login(id, aal) {
      await db.exec("reset role");
      const sid = (await one("insert into auth.sessions(user_id) values($1) returning id", [id])).id;
      const now = Math.floor(Date.now()/1000);
      const amr = [{ method: "password", timestamp: now }];
      if (aal === "aal2") amr.push({ method: "totp", timestamp: now });
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub:id, role:"authenticated", aal, session_id:sid, amr })]);
      await db.exec("set role authenticated");
      await db.query("select * from security_session_status()");
    }
    await login(student, "aal1");
    assert.equal((await one("select security_requires_mfa() m")).m, false);
    assert.equal((await one("select security_gate() g")).g, true);
    assert.equal((await db.query("select * from profiles")).rows.length, 1);
    assert.equal((await one("select security_has_recent_auth() r")).r, true);
    await assert.rejects(db.query("select adjust_credits($1,1)", [student]), /NOT_ALLOWED/);
    await login(teacher, "aal1");
    assert.equal((await one("select security_requires_mfa() m")).m, true);
    assert.equal((await one("select security_gate() g")).g, false);
    assert.equal((await db.query("select * from profiles")).rows.length, 0);
    await assert.rejects(db.query("select adjust_credits($1,1)", [student]), /MFA_REQUIRED/);
    await login(teacher, "aal2");
    assert.equal((await one("select security_gate() g")).g, true);
    assert.equal((await one("select adjust_credits($1,1) credits", [student])).credits, 1);
    await db.exec("reset role");
    await db.query("update profiles set is_active=false where id=$1", [student]);
    await login(student, "aal1");
    assert.equal((await one("select security_gate() g")).g, false);
  } finally { await db.close(); }
});
