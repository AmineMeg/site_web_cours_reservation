// Booking / RLS regression with password-only students and MFA teachers.
// Run: node --test tests/security  (PGlite from PGLITE_PATH or the project)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { loadPglite, prepare, PLATFORM } = require("./pg-harness.cjs");

const PGlite = loadPglite();
const skip = PGlite ? false : "PGlite not available (set PGLITE_PATH to a node_modules folder containing @electric-sql/pglite)";
const schemaSql = prepare(readFileSync(path.resolve(__dirname, "..", "..", "supabase", "schema.sql"), "utf8"));

test("booking, credits, contacts and RLS rules hold with password-only students", { skip }, async (t) => {
  const db = new PGlite();
  await db.exec(PLATFORM);
  await db.exec(schemaSql);
  await db.exec(schemaSql); // idempotent
  await db.exec(readFileSync(path.resolve(__dirname, "..", "..", "supabase", "student-password-login.sql"), "utf8"));

  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const count = async (sql, params) => (await db.query(sql, params)).rows.length;
  const as = async (role, claims) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', $1, false)", [claims ? JSON.stringify(claims) : ""]);
    if (role) await db.exec(`set role ${role}`);
  };
  const signIn = async (userId) => {
    await as(null, null);
    const { role } = await one("select role from public.profiles where id=$1", [userId]);
    const { id } = await one("insert into auth.sessions (user_id) values ($1) returning id", [userId]);
    const now = Math.floor(Date.now() / 1000);
    const claims = { sub: userId, role: "authenticated", aal: role === "teacher" ? "aal2" : "aal1", session_id: id,
      amr: [{ method: "password", timestamp: now - 30 }, ...(role === "teacher" ? [{ method: "totp", timestamp: now }] : [])] };
    await as("authenticated", claims);
    assert.equal((await one("select session_ok from public.security_session_status()")).session_ok, true);
  };
  const user = async (email, meta) => {
    const { id } = await one("insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id", [email, JSON.stringify(meta)]);
    return id;
  };

  const teacher = await user("t@x.com", { full_name: "Teacher" });
  const student = await user("s@x.com", { full_name: "Stu", phone: "123" });
  await db.query("update public.profiles set role = 'teacher' where id = $1", [teacher]);
  await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'verified')", [teacher]);
  const p = await one("select * from public.profiles where id = $1", [student]);
  assert.ok(p.full_name === "Stu" && p.phone === "123" && p.role === "student" && p.credits === 0, "profile auto-created by trigger");
  await db.exec("update public.weekly_availability set is_active = true, start_time = '09:00', end_time = '17:00'");

  const slot = async (days, hm) => (await one(
    `select ((date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '${days} days ${hm}') at time zone 'America/Sao_Paulo') ts`)).ts.toISOString();
  const s10 = await slot(2, "10:00"), s1030 = await slot(2, "10:30"), s11 = await slot(2, "11:00");
  const s16 = await slot(2, "16:00"), s1630 = await slot(2, "16:30"), d3 = await slot(3, "10:00"), far = await slot(60, "10:00");
  const avail = async (ts) => (await one("select public.is_slot_available($1) a", [ts])).a;

  await t.test("student rules", async () => {
    await signIn(student);
    await assert.rejects(db.query("select public.book_lesson($1)", [s10]), /NO_CREDITS/);
    await assert.rejects(db.query("select public.adjust_credits($1, 5)", [student]), /NOT_ALLOWED/);
    await db.query("update public.profiles set credits = 99, role = 'teacher', objectives = 'Travel' where id = $1", [student]);
    const p2 = await one("select credits, role, objectives from public.profiles where id = $1", [student]);
    assert.deepEqual(p2, { credits: 0, role: "student", objectives: "Travel" }, "student cannot change credits/role but can edit objectives");
    assert.equal(await count("select * from public.contacts"), 0, "student cannot read contacts");
    assert.equal(await count("select * from public.profiles"), 1, "student sees only own profile");
  });

  await t.test("teacher credits", async () => {
    await signIn(teacher);
    assert.equal((await one("select public.adjust_credits($1, 3) c", [student])).c, 3);
    assert.equal((await one("select public.adjust_credits($1, -10) c", [student])).c, 0, "credits never below 0");
    await db.query("select public.adjust_credits($1, 2)", [student]);
  });

  let b1;
  await t.test("availability and booking", async () => {
    await signIn(student);
    assert.equal(await avail(s10), true, "10:00 available");
    assert.equal(await avail(s1030), false, "10:30 misaligned");
    assert.equal(await avail(s16), true, "16:00 available (ends 17:00)");
    assert.equal(await avail(s1630), false, "16:30 past end");
    assert.equal(await avail(far), false, "60 days ahead");
    b1 = await one("select * from public.book_lesson($1)", [s10]);
    assert.equal(b1.status, "booked");
    await assert.rejects(db.query("select public.book_lesson($1)", [s10]), /SLOT_NOT_AVAILABLE/);
    await db.query("select public.book_lesson($1)", [s11]);
    assert.equal((await one("select credits from public.profiles where id = $1", [student])).credits, 0);
    await assert.rejects(db.query("select public.book_lesson($1)", [s16]), /NO_CREDITS/);
    assert.equal(await count("select * from public.get_busy_slots(now(), now() + interval '10 days')"), 2);
    await assert.rejects(db.query("select public.cancel_lesson($1, 'x')", [b1.id]), /NOT_ALLOWED/);
    await assert.rejects(db.query(
      "insert into public.bookings (student_id, starts_at, ends_at) values ($1, now() + interval '5 days', now() + interval '5 days 1 hour')",
      [student]), /row-level security/);
  });

  await t.test("teacher blocks a day and cancels with refund", async () => {
    await signIn(teacher);
    await db.query("insert into public.blocked_slots (day) values ((($1::timestamptz) at time zone 'America/Sao_Paulo')::date)", [d3]);
    await db.query("select public.adjust_credits($1, 1)", [student]);
    const cancelled = await one("select * from public.cancel_lesson($1, 'Sick')", [b1.id]);
    assert.ok(cancelled.status === "cancelled" && cancelled.cancel_message === "Sick");
    assert.equal((await one("select credits from public.profiles where id = $1", [student])).credits, 2, "credit refunded");
    await assert.rejects(db.query("select public.cancel_lesson($1, 'x')", [b1.id]), /BOOKING_NOT_FOUND/);
    await signIn(student);
    assert.equal(await avail(d3), false, "blocked day");
    assert.equal(await avail(s10), true, "cancelled slot available again");
  });

  await t.test("anonymous visitors and contacts cleanup", async () => {
    await as("anon", { role: "anon" });
    await db.query("insert into public.contacts (name, email) values ('New', 'n@x.com')");
    assert.equal(await count("select * from public.contacts"), 0, "anon cannot read contacts");
    await assert.rejects(db.query("select public.book_lesson(now())"), /permission denied/);
    await as(null, null);
    await db.exec(`insert into public.contacts (name, email, created_at) values ('Old', 'o@x.com', now() - interval '40 days');
      insert into public.contacts (name, email, created_at, converted_at) values ('OldConverted', 'oc@x.com', now() - interval '40 days', now());`);
    assert.equal((await one("select public.delete_old_contacts() n")).n, 1);
    const left = (await db.query("select name from public.contacts order by name")).rows.map((r) => r.name).join(",");
    assert.equal(left, "New,OldConverted");
  });
});