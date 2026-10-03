const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const Module = require("node:module");
const ts = require("typescript");
const { load } = require("./load-typescript.cjs");
const { loadPglite, prepare, PLATFORM } = require("./security/pg-harness.cjs");
const { validTeacherBooking } = load("src/lib/teacher-booking.ts");
const { pt } = load("src/lib/i18n/pt.ts");
const { teacherBookingText: labels } = load("src/lib/i18n/teacher-booking.ts");
const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(path.join(root, "supabase/teacher-booking.sql"), "utf8");

test("teacher booking validates IDs, exact dates, clock times and explicit credit/exception choices", () => {
  const valid = { studentId: randomUUID(), requestId: randomUUID(), day: "2026-10-05", time: "09:00", useCredit: true, exceptional: false };
  assert.equal(validTeacherBooking(valid), true);
  assert.equal(validTeacherBooking({ ...valid, day: "2028-02-29", time: "23:59", useCredit: false }), true);
  for (const change of [
    { day: "2026-02-29" }, { day: "2026-02-31" }, { day: "2026-13-05" }, { day: "invalid" },
    { time: "24:00" }, { time: "09:60" }, { time: "09:00:30" }, { time: "9:00" },
    { studentId: "bad" }, { requestId: null }, { useCredit: "true" }, { exceptional: null },
  ]) assert.equal(validTeacherBooking({ ...valid, ...change }), false);
});

test("gift cancellation email never promises a refund", () => {
  const base = { name: "Ana", when: "segunda-feira às 09:00", message: "Preciso remarcar." };
  assert.match(pt.emails.cancellation.body(base), /Seu crédito foi devolvido/);
  const gift = pt.emails.cancellation.body({ ...base, refundedCredits: 0 });
  assert.doesNotMatch(gift, /Seu crédito foi devolvido/);
  assert.match(gift, /nenhum crédito foi usado ou devolvido/);
});

function actionModule(requireTeacher, messages, invalidations) {
  const filename = path.join(root, "src/app/admin/actions.ts");
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = (name) => {
    if (name === "next/cache") return { revalidatePath: (...args) => invalidations.push(args) };
    if (name === "@/lib/auth") return { requireTeacher, getSettings: async () => ({ timezone: "America/Sao_Paulo" }) };
    if (name === "@/lib/notifications") return { sendBookingEmails: async (data) => { messages.push(data); return { ok: false }; } };
    if (name === "@/lib/utils") return {};
    if (name === "@/lib/i18n") return { t: pt };
    if (["@/lib/supabase/admin", "@/lib/email", "@/lib/auth-links", "@/lib/verify-password"].includes(name)) return {};
    if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
    return require(name);
  };
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return compiled.exports;
}

test("admin action authenticates first, uses RPC data, prevents duplicate emails and distinguishes delivery failure", async () => {
  const messages = [], invalidations = [], calls = [];
  const input = { studentId: randomUUID(), requestId: randomUUID(), day: "2026-10-05", time: "09:00", useCredit: false, exceptional: true };
  const denied = actionModule(async () => { throw new Error("Teacher MFA required"); }, messages, invalidations);
  await assert.rejects(denied.addTeacherLesson(input), /Teacher MFA required/);
  let result = { data: { booking_id: randomUUID(), starts_at: "2026-10-05T12:00:00Z", credits_used: 0, created: true }, error: null };
  const lookup = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { full_name: "Ana", email: "ana@test.com" }, error: null }; } };
  const actions = actionModule(async () => ({ supabase: {
    from: () => lookup,
    rpc(name, params) { calls.push({ name, params }); return { async single() { return result; } }; },
  } }), messages, invalidations);
  assert.deepEqual(await actions.addTeacherLesson({ ...input, time: "25:00" }), { ok: false, message: labels.invalid });
  assert.equal(calls.length, 0);
  assert.deepEqual(await actions.addTeacherLesson(input), { ok: true, message: labels.savedWithoutEmail });
  assert.equal(calls[0].name, "teacher_book_lesson");
  assert.equal(calls[0].params.p_use_credit, false);
  assert.equal(calls[0].params.p_exceptional, true);
  assert.equal(messages[0].creditsUsed, 0);
  assert.match(messages[0].when, /09:00/);
  assert.ok(invalidations.some(([route]) => route === "/dashboard"));
  result = { ...result, data: { ...result.data, created: false } };
  assert.deepEqual(await actions.addTeacherLesson(input), { ok: true, message: labels.alreadySaved });
  assert.equal(messages.length, 1);
  result = { data: null, error: { code: "P0001", message: "NO_CREDITS" } };
  assert.deepEqual(await actions.addTeacherLesson(input), { ok: false, message: labels.noCredits });
  assert.equal(messages.length, 1);
});

const PGlite = loadPglite();
test("teacher booking is role-safe, atomic, overlap-safe and refunds only charged lessons", {
  skip: PGlite ? false : "Set PGLITE_PATH for SQL tests",
}, async (t) => {
  const db = new PGlite();
  try {
    await db.exec(PLATFORM);
    await db.exec(prepare(fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8")));
    const one = async (q, args) => (await db.query(q, args)).rows[0];
    const teacher = (await one("insert into auth.users(email) values('teacher@test.com') returning id")).id;
    const student = (await one("insert into auth.users(email) values('student@test.com') returning id")).id;
    const emptyStudent = (await one("insert into auth.users(email) values('empty@test.com') returning id")).id;
    const inactive = (await one("insert into auth.users(email) values('paused@test.com') returning id")).id;
    await db.query("update profiles set role='teacher' where id=$1", [teacher]);
    await db.query("update profiles set is_active=false where id=$1", [inactive]);
    await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')", [teacher]);
    // Simulate pre-migration bookings, which must retain a one-credit refund.
    const old = (await one("insert into bookings(student_id,starts_at,ends_at) values($1,now()+interval '10 days',now()+interval '10 days 1 hour') returning id", [student])).id;
    await db.exec(fs.readFileSync(path.join(root, "supabase/student-password-login.sql"), "utf8"));
    await db.exec(migration);
    await db.exec(migration);
    assert.equal((await one("select credits_used from bookings where id=$1", [old])).credits_used, 1);
    await db.exec("update weekly_availability set is_active=true,start_time='09:00',end_time='17:00'");
    const day = (await one("select to_char((now() at time zone 'America/Sao_Paulo')::date + 2,'YYYY-MM-DD') as day_key")).day_key;
    const login = async (id, aal) => {
      await db.exec("reset role");
      const sid = (await one("insert into auth.sessions(user_id) values($1) returning id", [id])).id;
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({
        sub: id, role: "authenticated", aal, session_id: sid,
        amr: [{ method: aal === "aal2" ? "totp" : "password", timestamp: Math.floor(Date.now()/1000) }],
      })]);
      await db.exec("set role authenticated");
      await db.query("select * from security_session_status()");
    };
    const book = (id, time, useCredit = true, exceptional = false, requestId = randomUUID(), chosenDay = day) =>
      db.query("select * from teacher_book_lesson($1,$2,$3,$4,$5,$6)", [id, chosenDay, time, useCredit, exceptional, requestId]);
    const balance = async (id) => (await one("select credits from profiles where id=$1", [id])).credits;
    const count = async () => (await one("select count(*)::int n from bookings")).n;

    await t.test("teacher AAL1, student and anonymous callers cannot use teacher booking", async () => {
      await login(teacher, "aal1");
      await assert.rejects(book(student, "09:00"), /MFA_REQUIRED/);
      await login(student, "aal1");
      await assert.rejects(book(student, "09:00", false, true), /NOT_ALLOWED/);
      await assert.rejects(db.query("insert into bookings(student_id,starts_at,ends_at,credits_used) values($1,now()+interval '5 days',now()+interval '5 days 1 hour',0)", [student]), /row-level security/);
      await db.exec("reset role; set role anon");
      await assert.rejects(book(student, "09:00"), /permission denied/);
      await login(teacher, "aal2");
    });
    let charged, gift;
    await t.test("charged booking consumes exactly one credit; retries are idempotent", async () => {
      await db.query("select adjust_credits($1,3)", [student]);
      const requestId = randomUUID();
      charged = (await book(student, "09:00", true, false, requestId)).rows[0];
      assert.equal(charged.created, true);
      assert.equal(charged.credits_used, 1);
      assert.equal(new Date(charged.starts_at).getUTCHours(), 12);
      assert.equal(await balance(student), 2);
      const repeat = (await book(student, "09:00", true, false, requestId)).rows[0];
      assert.equal(repeat.booking_id, charged.booking_id);
      assert.equal(repeat.created, false);
      assert.equal(await balance(student), 2);
      await assert.rejects(book(student, "10:00", true, false, requestId), /REQUEST_CONFLICT/);
      await assert.rejects(book(student, "09:30", true, true), /SLOT_NOT_AVAILABLE/);
      assert.equal(await balance(student), 2);
    });
    await t.test("no-credit and inactive students cannot be charged; gifts do not change balances", async () => {
      await assert.rejects(book(emptyStudent, "10:00"), /NO_CREDITS/);
      await assert.rejects(book(inactive, "10:00", false, true), /STUDENT_NOT_ACTIVE/);
      await assert.rejects(book(teacher, "10:00", false, true), /STUDENT_NOT_ACTIVE/);
      gift = (await book(emptyStudent, "10:00", false)).rows[0];
      assert.equal(gift.credits_used, 0);
      assert.equal(await balance(emptyStudent), 0);
    });
    await t.test("exceptional booking bypasses blocks and working hours, never overlaps or past dates", async () => {
      await db.query("insert into blocked_slots(day,start_time,end_time) values($1,'11:00','12:00')", [day]);
      await assert.rejects(book(student, "11:00"), /SLOT_NOT_AVAILABLE/);
      await book(student, "11:00", true, true);
      await assert.rejects(book(student, "08:00", false), /SLOT_NOT_AVAILABLE/);
      await book(student, "08:00", false, true);
      await assert.rejects(book(student, "23:30", false, true), /INVALID_BOOKING/);
      await assert.rejects(book(student, "09:00", false, true, randomUUID(), "2000-01-01"), /INVALID_BOOKING/);
      await assert.rejects(book(student, "09:00:30", false, true), /INVALID_BOOKING/);
      await assert.rejects(book(student, "24:00", false, true), /INVALID_BOOKING/);
      const before = await count();
      const races = await Promise.allSettled([
        book(student, "18:00", false, true), book(emptyStudent, "18:30", false, true),
      ]);
      assert.equal(races.filter(result => result.status === "fulfilled").length, 1);
      assert.equal(await count(), before + 1);
      assert.match(migration, /pg_advisory_xact_lock\(hashtext\('public.book_lesson'\)\)/);
    });
    await t.test("gift cancellations do not grant credits and charged cancellations refund exactly once", async () => {
      const before = await balance(student);
      await db.query("select cancel_lesson($1,'Remarcar')", [charged.booking_id]);
      assert.equal(await balance(student), before + 1);
      await assert.rejects(db.query("select cancel_lesson($1,'Remarcar')", [charged.booking_id]), /BOOKING_NOT_FOUND/);
      assert.equal(await balance(student), before + 1);
      await db.query("select cancel_lesson($1,'Remarcar')", [gift.booking_id]);
      assert.equal(await balance(emptyStudent), 0);
      await db.query("select cancel_lesson($1,'Remarcar')", [old]);
      assert.equal(await balance(student), before + 2);
    });
    await t.test("student booking still costs one credit and cannot overlap a teacher exception", async () => {
      await login(student, "aal1");
      await db.query("select book_lesson(($1::date + time '12:00') at time zone 'America/Sao_Paulo')", [day]);
      const booking = await one("select credits_used from bookings where student_id=$1 and starts_at=($2::date+time '12:00') at time zone 'America/Sao_Paulo'", [student, day]);
      assert.equal(booking.credits_used, 1);
      await assert.rejects(db.query("select book_lesson(($1::date+time '11:00') at time zone 'America/Sao_Paulo')", [day]), /SLOT_NOT_AVAILABLE/);
      await login(teacher, "aal2");
      assert.equal((await one("select count(*)::int n from bookings where credits_used=0")).n >= 2, true);
    });
  } finally { await db.close(); }
});
