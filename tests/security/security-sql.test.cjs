// Database security tests (PGlite). Run: node --test tests/security
// PGlite is resolved from PGLITE_PATH (a node_modules folder) or the project.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { execSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");

const { loadPglite, prepare, PLATFORM } = require("./pg-harness.cjs");
const PGlite = loadPglite();
const skip = PGlite ? false : "PGlite not available (set PGLITE_PATH to a node_modules folder containing @electric-sql/pglite)";

const schemaSql = prepare(readFileSync(path.join(root, "supabase", "schema.sql"), "utf8"));
const securitySql = prepare(readFileSync(path.join(root, "supabase", "security.sql"), "utf8"));

async function freshDb(...scripts) {
  const db = new PGlite();
  await db.exec(PLATFORM);
  for (const script of scripts) await db.exec(script);
  return db;
}

async function snapshot(db) {
  const q = async (sql) => JSON.stringify((await db.query(sql)).rows);
  return {
    functions: await q(`select p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_functiondef(p.oid) def,
        (select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ',' order by 1) from aclexplode(p.proacl) a) acl
      from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1, 2`),
    policies: await q(`select tablename, policyname, permissive, roles::text, cmd, qual, with_check
      from pg_policies where schemaname = 'public' order by 1, 2`),
    triggers: await q(`select tgrelid::regclass::text t, tgname, pg_get_triggerdef(oid) def from pg_trigger
      where not tgisinternal order by 1, 2`),
    tables: await q(`select c.relname, c.relrowsecurity,
        (select string_agg(a.grantee::regrole::text || ':' || a.privilege_type, ',' order by 1) from aclexplode(c.relacl) a) acl
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1`),
    columns: await q(`select table_name, column_name, data_type, column_default, is_nullable
      from information_schema.columns where table_schema = 'public' order by 1, 2`),
  };
}

let db;
const ids = {};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const all = async (sql, params) => (await db.query(sql, params)).rows;

async function asRole(role, claims) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims ? JSON.stringify(claims) : ""]);
  if (role) await db.exec(`set role ${role}`);
}
const asPostgres = () => asRole(null, null);
const asService = () => asRole("service_role", { role: "service_role" });
const asAnon = () => asRole("anon", { role: "anon" });

// Creates a Supabase Auth session and returns claims for it.
async function newSession(userId, { aal = "aal2", totpAgoSeconds = 5, createdAgo = "0 seconds" } = {}) {
  await asPostgres();
  const { id } = await one(`insert into auth.sessions (user_id, created_at, updated_at) values ($1, now() - $2::interval, now() - $2::interval) returning id`, [userId, createdAgo]);
  const now = Math.floor(Date.now() / 1000);
  const amr = [{ method: "password", timestamp: now - 600 }];
  if (aal === "aal2") amr.unshift({ method: "totp", timestamp: now - totpAgoSeconds });
  return { sub: userId, role: "authenticated", aal, session_id: id, amr };
}
// Signs in "through the app": the server always calls security_session_status first.
async function signIn(claims) {
  await asRole("authenticated", claims);
  return one("select * from public.security_session_status()");
}
const gate = async () => (await one("select public.security_gate() g")).g;

async function makeUser(email, { teacher = false, factor = true } = {}) {
  await asPostgres();
  const { id } = await one("insert into auth.users (email, raw_user_meta_data) values ($1, '{\"full_name\":\"X\"}') returning id", [email]);
  if (teacher) await db.query("update public.profiles set role = 'teacher' where id = $1", [id]);
  if (factor) await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'verified')", [id]);
  return id;
}

const slot = async (days, hm) => (await one(
  `select ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '${days} days ${hm}') at time zone 'Europe/Lisbon') ts`)).ts.toISOString();

let ready;
const setup = () => (ready ??= (async () => {
  db = await freshDb(schemaSql);
  await db.exec("update public.weekly_availability set is_active = true, start_time = '09:00', end_time = '17:00'");
  ids.teacher = await makeUser("t@x.com", { teacher: true });
  ids.student = await makeUser("s@x.com");
  ids.other = await makeUser("o@x.com");
  ids.nofactor = await makeUser("n@x.com", { factor: false });
})());

test("schema.sql and security.sql are idempotent and produce the same database", { skip }, async () => {
  await setup();
  await db.exec(schemaSql);
  await db.exec(securitySql);
  let head;
  try {
    head = prepare(execSync("git show HEAD:supabase/schema.sql", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString());
  } catch {
    return; // Not a git checkout: drift check not possible.
  }
  const fromSchema = await freshDb(schemaSql);
  const migrated = await freshDb(head, securitySql, securitySql);
  const [a, b] = [await snapshot(fromSchema), await snapshot(migrated)];
  for (const key of Object.keys(a)) assert.equal(b[key], a[key], `drift in ${key}`);
});

test("every public table has the restrictive AAL2 policy and RLS", { skip }, async () => {
  await setup();
  await asPostgres();
  const tables = await all(`select c.relname, c.relrowsecurity from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`);
  assert.ok(tables.length >= 12);
  for (const t of tables) {
    assert.ok(t.relrowsecurity, `${t.relname} has RLS`);
    const policy = await one(`select permissive, cmd, roles::text roles, qual, with_check from pg_policies
      where schemaname = 'public' and tablename = $1 and policyname = 'security: require mfa (aal2)'`, [t.relname]);
    assert.ok(policy, `${t.relname} has the MFA policy`);
    assert.equal(policy.permissive, "RESTRICTIVE");
    assert.equal(policy.cmd, "ALL");
    assert.match(policy.qual, /aal2.*security_gate/s);
    assert.match(policy.with_check, /aal2.*security_gate/s);
  }
});

test("AAL1 sessions can read nothing and call no business function", { skip }, async () => {
  await setup();
  const status = await signIn(await newSession(ids.student, { aal: "aal1" }));
  assert.equal(status.session_ok, true);
  assert.equal(status.aal, "aal1");
  assert.equal(status.has_verified_factor, true);
  assert.equal(await gate(), false);
  for (const table of ["profiles", "bookings", "messages", "app_settings", "weekly_availability", "blocked_slots", "contacts", "security_audit_log"]) {
    assert.equal((await all(`select * from public.${table}`)).length, 0, table);
  }
  const ts = await slot(2, "10:00");
  await assert.rejects(db.query("select public.get_busy_slots(now(), now() + interval '1 day')"), /MFA_REQUIRED/);
  await assert.rejects(db.query("select public.is_slot_available($1)", [ts]), /MFA_REQUIRED/);
  await assert.rejects(db.query("select public.book_lesson($1)", [ts]), /MFA_REQUIRED/);
  await assert.rejects(db.query("select public.adjust_credits($1, 1)", [ids.student]), /MFA_REQUIRED/);
  await assert.rejects(db.query("select public.cancel_lesson(gen_random_uuid(), '')"), /MFA_REQUIRED/);
  await assert.rejects(db.query("select public.security_recovery_codes_remaining()"), /MFA_REQUIRED/);
  await assert.rejects(db.query("insert into public.messages (student_id, body) values ($1, 'hi')", [ids.student]), /row-level security/);
  await db.query("update public.profiles set objectives = 'hack' where id = $1", [ids.student]);
  await asPostgres();
  assert.notEqual((await one("select objectives from public.profiles where id = $1", [ids.student])).objectives, "hack");

  // An AAL1 teacher is not a teacher.
  await signIn(await newSession(ids.teacher, { aal: "aal1" }));
  assert.equal((await one("select public.is_teacher() t")).t, false);
});

test("forged or untracked AAL2 claims and users without a verified factor are refused", { skip }, async () => {
  await setup();
  await asRole("authenticated", { sub: ids.student, role: "authenticated", aal: "aal2", session_id: "6b0c5b1e-1111-4111-8111-111111111111" });
  assert.equal(await gate(), false);
  assert.equal((await one("select * from public.security_session_status()")).reason, "revoked");

  const claims = await newSession(ids.student);
  await asRole("authenticated", claims); // session_status not yet called: untracked
  assert.equal(await gate(), false);
  await asRole("authenticated", { ...claims, session_id: "not-a-uuid" });
  assert.equal(await gate(), false);
  await asRole("authenticated", { ...claims, sub: ids.other }); // someone else's session
  assert.equal((await one("select * from public.security_session_status()")).reason, "revoked");

  const status = await signIn(await newSession(ids.nofactor));
  assert.equal(status.has_verified_factor, false);
  assert.equal(await gate(), false);
  assert.equal((await all("select * from public.profiles")).length, 0);
});

test("AAL2 business flows still work (regression)", { skip }, async () => {
  await setup();
  const teacher = await newSession(ids.teacher);
  const student = await newSession(ids.student);
  assert.equal((await signIn(teacher)).session_ok, true);
  assert.equal(await gate(), true);
  assert.equal((await one("select public.is_teacher() t")).t, true);
  assert.equal((await one("select public.adjust_credits($1, 2) c", [ids.student])).c, 2);

  await signIn(student);
  assert.equal(await gate(), true);
  assert.equal((await all("select * from public.profiles")).length, 1);
  const s10 = await slot(2, "10:00");
  assert.equal((await one("select public.is_slot_available($1) a", [s10])).a, true);
  const booking = await one("select * from public.book_lesson($1)", [s10]);
  assert.equal(booking.status, "booked");
  await assert.rejects(db.query("select public.book_lesson($1)", [s10]), /SLOT_NOT_AVAILABLE/);
  assert.equal((await all("select * from public.get_busy_slots(now(), now() + interval '7 days')")).length, 1);
  await assert.rejects(db.query("select public.adjust_credits($1, 5)", [ids.student]), /NOT_ALLOWED/);
  await db.query("update public.profiles set credits = 99, role = 'teacher', objectives = 'Travel' where id = $1", [ids.student]);
  const own = await one("select credits, role, objectives from public.profiles where id = $1", [ids.student]);
  assert.deepEqual(own, { credits: 1, role: "student", objectives: "Travel" });
  await db.query("insert into public.messages (student_id, body) values ($1, 'hello')", [ids.student]);
  assert.equal((await all("select * from public.contacts")).length, 0);

  await signIn(teacher);
  const cancelled = await one("select * from public.cancel_lesson($1, 'sorry')", [booking.id]);
  assert.equal(cancelled.status, "cancelled");
  assert.equal((await one("select credits from public.profiles where id = $1", [ids.student])).credits, 2);
  assert.equal((await all("select * from public.messages")).length, 1);
  // Anonymous visitors can still use the contact form.
  await asAnon();
  await db.query("insert into public.contacts (name, email) values ('Ann', 'ann@x.com')");
});

test("role and account protections", { skip }, async () => {
  await setup();
  const teacher = await newSession(ids.teacher);
  await signIn(teacher);
  await assert.rejects(db.query("update public.profiles set role = 'teacher' where id = $1", [ids.other]), /ROLE_CHANGE_FORBIDDEN/);
  await assert.rejects(db.query("update public.profiles set is_active = false where id = $1", [ids.teacher]), /TEACHER_CANNOT_BE_PAUSED/);
  await assert.rejects(db.query("update public.profiles set role = 'student' where id = $1", [ids.teacher]), /ROLE_CHANGE_FORBIDDEN/);
  await asService();
  await assert.rejects(db.query("update public.profiles set role = 'teacher' where id = $1", [ids.other]), /ROLE_CHANGE_FORBIDDEN/);
  const { id } = await (async () => { await asPostgres(); return one("insert into auth.users (email) values ('z@x.com') returning id"); })();
  await db.query("delete from public.profiles where id = $1", [id]);
  await asService();
  await assert.rejects(db.query("insert into public.profiles (id, role) values ($1, 'teacher')", [id]), /ROLE_CHANGE_FORBIDDEN/);
  await db.query("insert into public.profiles (id, role) values ($1, 'student')", [id]);

  // Pausing a student blocks the database for that student immediately.
  const other = await newSession(ids.other);
  assert.equal((await signIn(other)).session_ok, true);
  await signIn(teacher);
  await db.query("update public.profiles set is_active = false where id = $1", [ids.other]);
  await asRole("authenticated", other);
  assert.equal(await gate(), false);
  const status = await one("select * from public.security_session_status()");
  assert.equal(status.session_ok, false);
  assert.equal(status.reason, "account_inactive");
  await signIn(teacher);
  await db.query("update public.profiles set is_active = true where id = $1", [ids.other]);
});

test("idle, absolute and Supabase not_after limits end sessions permanently", { skip }, async () => {
  await setup();
  const idle = await newSession(ids.student);
  await signIn(idle);
  await asPostgres();
  await db.query("update public.security_sessions set last_seen_at = now() - interval '61 minutes' where session_id = $1", [idle.session_id]);
  await asRole("authenticated", idle);
  assert.equal(await gate(), false);
  assert.equal((await one("select * from public.security_session_status()")).reason, "idle_timeout");
  await asPostgres();
  await db.query("update public.security_sessions set last_seen_at = now() where session_id = $1", [idle.session_id]);
  assert.equal((await signIn(idle)).reason, "idle_timeout");
  assert.equal(await gate(), false);

  const old = await newSession(ids.student, { createdAgo: "13 hours" });
  assert.equal((await signIn(old)).reason, "absolute_timeout");
  assert.equal(await gate(), false);

  // An old session seen for the first time is judged on Supabase's last activity.
  const stale = await newSession(ids.student, { createdAgo: "3 hours" });
  assert.equal((await signIn(stale)).reason, "idle_timeout");

  const capped = await newSession(ids.student);
  await signIn(capped);
  assert.equal(await gate(), true);
  await asPostgres();
  await db.query("update auth.sessions set not_after = now() - interval '1 second' where id = $1", [capped.session_id]);
  await asRole("authenticated", capped);
  assert.equal(await gate(), false);

  const fresh = await newSession(ids.student);
  const status = await signIn(fresh);
  assert.equal(status.session_ok, true);
  assert.ok(new Date(status.idle_expires_at) > new Date());
  assert.ok(new Date(status.absolute_expires_at) > new Date(status.idle_expires_at));
});

test("sign-out and revocation (all devices / other devices)", { skip }, async () => {
  await setup();
  const a = await newSession(ids.student);
  const b = await newSession(ids.student);
  await signIn(a);
  await signIn(b);
  await asService();
  await db.query("select public.revoke_user_sessions($1, $2)", [ids.student, b.session_id]);
  assert.equal((await signIn(a)).reason, "revoked");
  assert.equal((await signIn(b)).session_ok, true);
  await asPostgres();
  assert.equal((await one("select count(*)::int n from auth.sessions where id = $1", [a.session_id])).n, 0);

  await asService();
  await db.query("select public.revoke_user_sessions($1)", [ids.student]);
  assert.equal((await signIn(b)).reason, "revoked");
  assert.equal(await gate(), false);

  const c = await newSession(ids.student);
  await signIn(c);
  await db.query("select public.security_end_current_session()");
  assert.equal((await signIn(c)).reason, "signed_out");
  // A user cannot end somebody else's session.
  const t = await newSession(ids.teacher);
  await signIn(t);
  await asRole("authenticated", { ...c, session_id: t.session_id });
  await db.query("select public.security_end_current_session()");
  assert.equal((await signIn(t)).session_ok, true);
});

test("recent authentication comes from the verified JWT amr claim", { skip }, async () => {
  await setup();
  const recent = await newSession(ids.student, { totpAgoSeconds: 60 });
  await signIn(recent);
  assert.equal((await one("select public.security_has_recent_auth() r")).r, true);
  assert.equal((await one("select public.security_has_recent_auth(30) r")).r, false);
  assert.equal((await one("select public.security_has_recent_auth(100000) r")).r, true);
  await db.query("select public.security_assert_recent_auth()");

  const stale = await newSession(ids.student, { totpAgoSeconds: 11 * 60 });
  await signIn(stale);
  assert.equal(await gate(), true);
  assert.equal((await one("select public.security_has_recent_auth() r")).r, false);
  await assert.rejects(db.query("select public.security_assert_recent_auth()"), /REAUTH_REQUIRED/);

  const future = await newSession(ids.student, { totpAgoSeconds: -3600 });
  await signIn(future);
  assert.equal((await one("select public.security_has_recent_auth() r")).r, false);

  const aal1 = await newSession(ids.student, { aal: "aal1" });
  await signIn(aal1);
  assert.equal((await one("select public.security_has_recent_auth() r")).r, false);
});

test("rate limits are atomic fixed windows on hashed keys", { skip }, async () => {
  await setup();
  await asService();
  const key = "a".repeat(64);
  const hit = async () => one("select * from public.security_rate_limit_hit('login:email', $1, 2, 900)", [key]);
  assert.equal((await hit()).allowed, true);
  assert.equal((await hit()).allowed, true);
  const denied = await hit();
  assert.equal(denied.allowed, false);
  assert.ok(denied.retry_after_seconds > 0 && denied.retry_after_seconds <= 900);
  await asPostgres();
  await db.query("update public.security_rate_limits set window_started_at = now() - interval '901 seconds'");
  await asService();
  assert.equal((await hit()).allowed, true);
  await db.query("select public.security_rate_limit_reset('login:email', $1)", [key]);
  await assert.rejects(db.query("select public.security_rate_limit_hit('login', 'raw@email.com', 2, 900)"), /INVALID_KEY/);
  await assert.rejects(db.query("select public.security_rate_limit_hit('login', $1, 0, 900)", [key]), /INVALID_LIMIT/);
});

test("recovery codes: hashed, single use, and recovery ends every session", { skip }, async () => {
  await setup();
  const hashes = Array.from({ length: 10 }, (_, i) => String(i).repeat(64).slice(0, 64));
  await asService();
  await assert.rejects(db.query("select public.security_store_recovery_codes($1, $2)", [ids.nofactor, hashes]), /MFA_NOT_ENROLLED/);
  await assert.rejects(db.query("select public.security_store_recovery_codes($1, $2)", [ids.student, hashes.slice(0, 3)]), /INVALID_CODES/);
  await assert.rejects(db.query("select public.security_store_recovery_codes($1, $2)", [ids.student, [...hashes.slice(0, 9), hashes[0]]]), /INVALID_CODES/);
  assert.equal((await one("select public.security_store_recovery_codes($1, $2) n", [ids.student, hashes])).n, 10);

  const session = await newSession(ids.student);
  await signIn(session);
  assert.equal((await one("select public.security_recovery_codes_remaining() n")).n, 10);
  await assert.rejects(db.query("select * from public.security_recovery_codes"), /permission denied/);

  await asService();
  const consume = async (user, hash) => (await one("select public.security_consume_recovery_code($1, $2) ok", [user, hash])).ok;
  assert.equal(await consume(ids.other, hashes[0]), false);
  assert.equal(await consume(ids.student, "f".repeat(64)), false);
  assert.equal(await consume(ids.student, hashes[0]), true);
  assert.equal(await consume(ids.student, hashes[0]), false);
  await assert.rejects(db.query("select public.security_finish_mfa_recovery($1)", [ids.student]), /FACTORS_STILL_PRESENT/);

  await asPostgres();
  await db.query("delete from auth.mfa_factors where user_id = $1", [ids.student]);
  await asService();
  await db.query("select public.security_finish_mfa_recovery($1)", [ids.student]);
  await asPostgres();
  assert.equal((await one("select count(*)::int n from public.security_recovery_codes where user_id = $1", [ids.student])).n, 0);
  const status = await signIn(session);
  assert.equal(status.reason, "revoked");
  // A fresh password-only session after recovery has no data access until re-enrolment.
  const after = await signIn(await newSession(ids.student));
  assert.equal(after.session_ok, true);
  assert.equal(after.has_verified_factor, false);
  assert.equal(await gate(), false);
  await asPostgres();
  const events = (await all("select event from public.security_audit_log where subject_id = $1", [ids.student])).map((r) => r.event);
  for (const event of ["mfa.recovery_codes_generated", "mfa.recovery_code_used", "mfa.recovery_code_rejected", "mfa.reset_by_recovery", "session.revoked_all"]) {
    assert.ok(events.includes(event), event);
  }
  await asService();
  await assert.rejects(db.query("select public.security_finish_mfa_recovery($1, 'admin')", [ids.student]), /INVALID_METHOD/);
  await db.query("select public.security_finish_mfa_recovery($1, 'teacher')", [ids.student]);
  await asPostgres();
  assert.equal((await one("select count(*)::int n from public.security_audit_log where subject_id = $1 and event = 'mfa.reset_by_teacher'", [ids.student])).n, 1);
  await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'verified')", [ids.student]);
});

test("audit trail records sensitive changes and is append-only", { skip }, async () => {
  await setup();
  const teacher = await newSession(ids.teacher);
  await signIn(teacher);
  await db.query("select public.adjust_credits($1, 3)", [ids.other]);
  await db.query("update public.profiles set teacher_notes = 'secret note' where id = $1", [ids.other]);
  await asPostgres();
  const credit = await one("select * from public.security_audit_log where event = 'credits.changed' and subject_id = $1 order by id desc limit 1", [ids.other]);
  assert.equal(credit.actor_id, ids.teacher);
  assert.equal(credit.db_role, "authenticated");
  assert.equal(credit.details.credits_to - credit.details.credits_from, 3);
  const sensitive = await one("select * from public.security_audit_log where event = 'profile.sensitive_update' and subject_id = $1 order by id desc limit 1", [ids.other]);
  assert.deepEqual(sensitive.details.fields, ["teacher_notes"]);
  assert.ok(!JSON.stringify(sensitive.details).includes("secret note"));
  const bookingEvents = (await all("select event from public.security_audit_log where table_name = 'bookings'")).map((r) => r.event);
  assert.ok(bookingEvents.includes("booking.created") && bookingEvents.includes("booking.cancelled"));

  await asService();
  await db.query("select public.security_log_event('login.failed', null, '{\"key\":\"abc\"}')");
  await assert.rejects(db.query("select public.security_log_event('Bad Event', null, '{}')"), /INVALID_EVENT/);
  await assert.rejects(db.query("select public.security_log_event('x.big', null, $1)", [JSON.stringify({ a: "x".repeat(3000) })]), /INVALID_DETAILS/);
  // Service-role writes: the trigger records db_role service_role (no JWT actor);
  // the server attributes the change with an explicit actor event.
  await db.query("update public.profiles set is_active = false where id = $1", [ids.other]);
  await db.query("update public.profiles set is_active = true where id = $1", [ids.other]);
  await db.query("select public.security_log_event('admin.student_updated', $1, '{\"fields\":[\"is_active\"]}', $2)", [ids.other, ids.teacher]);
  await asPostgres();
  const serviceChange = await one("select * from public.security_audit_log where event = 'profile.sensitive_update' and subject_id = $1 order by id desc limit 1", [ids.other]);
  assert.equal(serviceChange.db_role, "service_role");
  assert.equal(serviceChange.actor_id, null);
  const attributed = await one("select * from public.security_audit_log where event = 'admin.student_updated' order by id desc limit 1");
  assert.equal(attributed.actor_id, ids.teacher);
  assert.equal(attributed.subject_id, ids.other);
  await asService();  await assert.rejects(db.query("update public.security_audit_log set event = 'x.y'"), /permission denied/);
  await assert.rejects(db.query("delete from public.security_audit_log"), /permission denied/);

  // Students see only their own audit entries; nobody can write directly.
  const other = await newSession(ids.other);
  await signIn(other);
  const visible = await all("select distinct subject_id from public.security_audit_log");
  assert.deepEqual(visible.map((r) => r.subject_id), [ids.other]);
  await assert.rejects(db.query("insert into public.security_audit_log (event) values ('x.y')"), /permission denied/);
  await signIn(teacher);
  assert.ok((await all("select distinct subject_id from public.security_audit_log")).length > 1);
});

test("security tables and service functions are closed to browsers", { skip }, async () => {
  await setup();
  const student = await newSession(ids.student);
  await signIn(student);
  for (const table of ["security_sessions", "security_rate_limits", "security_recovery_codes", "security_settings"]) {
    await assert.rejects(db.query(`select * from public.${table}`), /permission denied/, table);
  }
  const serviceOnly = [
    "select public.revoke_user_sessions(gen_random_uuid())",
    `select public.security_rate_limit_hit('x', '${"a".repeat(64)}', 1, 1)`,
    `select public.security_rate_limit_reset('x', '${"a".repeat(64)}')`,
    "select public.security_store_recovery_codes(gen_random_uuid(), '{}')",
    `select public.security_consume_recovery_code(gen_random_uuid(), '${"a".repeat(64)}')`,
    "select public.security_finish_mfa_recovery(gen_random_uuid())",
    "select public.security_log_event('x.y.z', null, '{}')",
    "select public.security_write_audit('x.y.z', null, null, null, '{}')",
    "select public.security_purge_expired()",
    "select public.security_has_verified_totp(gen_random_uuid())",
    "select public.delete_old_contacts()",
  ];
  for (const sql of serviceOnly) await assert.rejects(db.query(sql), /permission denied/, sql);
  await asAnon();
  for (const sql of [...serviceOnly, "select * from public.security_session_status()", "select public.get_busy_slots(now(), now())",
    "select public.is_teacher()", "select public.security_gate()"]) {
    await assert.rejects(db.query(sql), /permission denied/, sql);
  }
  await asService();
  await assert.rejects(db.query("select public.security_write_audit('x.y.z', null, null, null, '{}')"), /permission denied/);
  await assert.rejects(db.query("select public.book_lesson(now())"), /permission denied/);
  await db.query("select public.security_purge_expired()");
});