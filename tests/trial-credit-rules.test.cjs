const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, createHash, randomUUID } = require("node:crypto");
const { loadPglite, prepare, PLATFORM } = require("./security/pg-harness.cjs");
const { load } = require("./load-typescript.cjs");
const root = path.resolve(__dirname, "..");
const sql = (file) => fs.readFileSync(path.join(root, "supabase", file), "utf8");
const migration = sql("trial-and-credit-rules.sql");
const PGlite = loadPglite();

test("browser timezone detection supports UTC and rejects unavailable zones without guessing Brazil", () => {
  const { browserTimezone } = load("src/lib/timezones.ts");
  const original = Intl.DateTimeFormat;
  try {
    for (const [detected, expected] of [["Europe/Paris", "Europe/Paris"], ["America/Sao_Paulo", "America/Sao_Paulo"], ["UTC", "Etc/UTC"]]) {
      Intl.DateTimeFormat = function(locale, options) {
        return options ? new original(locale, options) : { resolvedOptions: () => ({ timeZone: detected }) };
      };
      assert.equal(browserTimezone(), expected);
    }
    Intl.DateTimeFormat = () => ({ resolvedOptions: () => ({ timeZone: "" }) });
    assert.throws(browserTimezone, /unavailable/);
  } finally {
    Intl.DateTimeFormat = original;
  }
});

test("locations use IANA city zones and dates follow each zone, including DST and different local days", () => {
  const { validLocation, validTimezone } = load("src/lib/timezones.ts");
  const { dayKeyOf, formatDateTime } = load("src/lib/dates.ts");
  assert.equal(validLocation({ country: "France", timezone: "Europe/Paris" }), true);
  for (const zone of ["", "Europe/Unknown", "GMT+3", "UTC"]) assert.equal(validTimezone(zone), false);
  assert.equal(validLocation({ country: "", timezone: "Europe/Paris" }), false);
  assert.equal(validLocation({ country: "x".repeat(101), timezone: "Europe/Paris" }), false);
  assert.equal(dayKeyOf("2026-10-05T00:30:00Z", "America/Sao_Paulo"), "2026-10-04");
  assert.equal(dayKeyOf("2026-10-05T00:30:00Z", "Asia/Tokyo"), "2026-10-05");
  assert.match(formatDateTime("2026-07-05T12:00:00Z", "Europe/Paris"), /UTC\+02:00/);
  assert.match(formatDateTime("2026-12-05T12:00:00Z", "Europe/Paris"), /UTC\+01:00/);
  const { studentBookingSlots, generateAvailableSlots } = load("src/lib/slots.ts");
  const slot = { startsAt: "2026-10-05T00:30:00Z", endsAt: "2026-10-05T01:30:00Z", dayKey: "2026-10-04", startMinutes: 1290 };
  assert.equal(studentBookingSlots([slot], "Asia/Tokyo", [{ remaining: 1, expires_at: slot.endsAt }])[0].dayKey, "2026-10-05");
  assert.equal(studentBookingSlots([slot], "Asia/Tokyo", [{ remaining: 1, expires_at: "2026-10-05T01:29:59Z" }]).length, 0);
  assert.equal(studentBookingSlots([slot], "Asia/Tokyo", [{ remaining: 0, expires_at: slot.endsAt }]).length, 0);
  const transitionSlots = generateAvailableSlots({
    settings: { timezone: "Europe/Paris", lesson_minutes: 60, min_notice_hours: 0, booking_window_days: 1 },
    weekly: [{ weekday: 0, is_active: true, start_time: "01:00", end_time: "05:00" }],
    blocked: [], busy: [], now: new Date("2026-03-28T23:00:00Z"),
  });
  assert.equal(transitionSlots.length, 2);
  assert.deepEqual(transitionSlots.map((s) => s.startMinutes), [180, 240]);
});

test("trial and credit migration enforces exact booking, expiry, cancellation and authorization rules", {
  skip: PGlite ? false : "Set PGLITE_PATH for SQL tests",
}, async (t) => {
  const db = new PGlite();
  try {
    await db.exec(PLATFORM);
    await db.exec(prepare(sql("schema.sql")));
    await db.exec(sql("student-password-login.sql"));
    await db.exec(sql("teacher-booking.sql"));
    const one = async (q, args = []) => (await db.query(q, args)).rows[0];
    const teacher = (await one("insert into auth.users(email) values('teacher@test.com') returning id")).id;
    const student = (await one("insert into auth.users(email) values('student@test.com') returning id")).id;
    const other = (await one("insert into auth.users(email) values('other@test.com') returning id")).id;
    await db.query("update profiles set role='teacher' where id=$1", [teacher]);
    await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')", [teacher]);
    await db.query("update profiles set credits=2 where id=$1", [student]);
    const legacy = (await one("insert into bookings(student_id, starts_at, ends_at) values($1,now()-interval '2 days',now()-interval '2 days'+interval '1 hour') returning id", [other])).id;
    try {
      await db.exec(migration);
      assert.ok((await one("select credit_batch_id from bookings where id=$1", [legacy])).credit_batch_id);
    } catch (error) {
      const position = Number(error.position ?? error.internalPosition ?? 0);
      const query = error.internalQuery ?? migration;
      assert.fail(`${error.message}; ${error.where ?? ""}; position ${position}: ${query.slice(Math.max(0, position - 180), position + 180)}`);
    }
    await db.exec(migration);
    const login = async (id, aal = "aal1") => {
      await db.exec("reset role");
      const sid = (await one("insert into auth.sessions(user_id) values($1) returning id", [id])).id;
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({
        sub: id, role: "authenticated", aal, session_id: sid,
        amr: [{ method: aal === "aal2" ? "totp" : "password", timestamp: Math.floor(Date.now() / 1000) }],
      })]);
      await db.exec("set role authenticated");
      await db.query("select * from security_session_status()");
    };
    const hash = () => createHash("sha256").update(randomBytes(32)).digest("hex");
    const issue = async (email, tokenHash) => {
      await db.exec("reset role; set role service_role");
      return (await one("select issue_trial_link('Ana',$1,'123','Aprender','França','Paris','Europe/Paris',$2) as id", [email, tokenHash])).id;
    };
    let contact, token, trial, start;
    await t.test("no account is created; tokens last exactly seven days and expose only their own schedule", async () => {
      token = hash(); contact = await issue("trial@test.com", token);
      const info = (await one("select trial_context($1) as context", [token])).context;
      assert.equal(info.contact.id, contact);
      assert.equal(info.contact.timezone, "Europe/Paris");
      assert.equal(info.booking, null);
      assert.ok(info.slots.length > 0);
      assert.equal(new Date(info.slots[0].endsAt) - new Date(info.slots[0].startsAt), 30 * 60000);
      await db.exec("reset role");
      assert.equal((await one("select count(*)::int n from auth.users")).n, 3);
      await db.exec("set role service_role");
      await assert.rejects(db.query("select trial_context($1)", [hash()]), /LINK_EXPIRED/);
      await db.exec("reset role");
      const diff = await one("select extract(epoch from (expires_at-now())) as seconds from trial_links where contact_id=$1", [contact]);
      assert.ok(Number(diff.seconds) <= 7 * 86400 && Number(diff.seconds) > 7 * 86400 - 10);
      await db.exec("set role service_role");
      await assert.rejects(db.query("select issue_trial_link('Ana','trial@test.com','','','França','Paris','Europe/Paris',$1)", [hash()]), /LINK_ALREADY_SENT/);
      start = info.slots.find((slot) => Date.parse(slot.startsAt) > Date.now() + 2 * 86400000).startsAt;
      trial = await one("select * from book_trial($1,$2)", [token, start]);
      assert.equal(Date.parse(trial.ends_at) - Date.parse(trial.starts_at), 30 * 60000);
      assert.equal((await one("select trial_context($1) as c", [token])).c.booking.id, trial.id);
      await assert.rejects(db.query("select book_trial($1,$2)", [token, start]), /TRIAL_ALREADY_BOOKED/);
    });
    await t.test("trials block student and exceptional teacher lessons and gate account creation at the start", async () => {
      await login(student);
      assert.equal((await one("select is_slot_available($1) as available", [start])).available, false);
      const busy = await db.query("select * from get_busy_slots($1,$2)", [start, trial.ends_at]);
      assert.equal(busy.rows.length, 1);
      await assert.rejects(db.query("select book_lesson($1)", [start]), /SLOT_NOT_AVAILABLE/);
      await login(teacher, "aal2");
      const dayTime = await one("select to_char($1::timestamptz at time zone 'America/Sao_Paulo','YYYY-MM-DD') as day, to_char($1::timestamptz at time zone 'America/Sao_Paulo','HH24:MI') as time", [start]);
      await assert.rejects(db.query("select * from teacher_book_lesson($1,$2,$3,false,true,$4)", [student, dayTime.day, dayTime.time, randomUUID()]), /SLOT_NOT_AVAILABLE/);
      assert.equal((await one("select can_convert_contact($1) as allowed", [contact])).allowed, false);
      await assert.rejects(db.query("update contacts set converted_at=now(), student_id=$1 where id=$2", [student, contact]), /TRIAL_NOT_STARTED/);
      await db.exec("reset role");
      await db.query("update trial_bookings set starts_at=now()-interval '10 minutes',ends_at=now()+interval '20 minutes' where id=$1", [trial.id]);
      await login(teacher, "aal2");
      assert.equal((await one("select can_convert_contact($1) as allowed", [contact])).allowed, true);
      await db.query("update contacts set trial_declined_at=now() where id=$1", [contact]);
      await db.exec("reset role; set role service_role");
      await assert.rejects(db.query("select trial_context($1)", [token]), /LINK_EXPIRED/);
    });
    await t.test("trial cancellation permits rebooking only while link remains valid", async () => {
      const h = hash(), id = await issue("cancel@test.com", h);
      const ctx = (await one("select trial_context($1) as c", [h])).c;
      const slot = ctx.slots.find((slot) => Date.parse(slot.startsAt) > Date.now() + 2 * 86400000);
      const first = await one("select * from book_trial($1,$2)", [h, slot.startsAt]);
      await db.query("select cancel_trial($1)", [h]);
      const next = await one("select * from book_trial($1,$2)", [h, slot.startsAt]);
      assert.notEqual(first.id, next.id);
      await db.exec("reset role");
      await db.query("update trial_bookings set starts_at=now()+interval '23 hours',ends_at=now()+interval '23 hours 30 minutes' where id=$1", [next.id]);
      await db.exec("set role service_role");
      await assert.rejects(db.query("select cancel_trial($1)", [h]), /CANCELLATION_TOO_LATE/);
      await db.exec("reset role");
      await db.query("update trial_links set expires_at=now() where contact_id=$1", [id]);
      await db.exec("set role service_role");
      await assert.rejects(db.query("select trial_context($1)", [h]), /LINK_EXPIRED/);
      await assert.rejects(db.query("select book_trial($1,$2)", [h, slot.startsAt]), /LINK_EXPIRED/);
      await login(teacher, "aal2");
      const replacement = hash();
      await db.query("select renew_trial_link($1,$2)", [id, replacement]);
      await db.exec("reset role; set role service_role");
      assert.equal((await one("select trial_context($1) as c", [replacement])).c.contact.id, id);
      await assert.rejects(db.query("select trial_context($1)", [h]), /LINK_EXPIRED/);
    });
    let booking, chargedBatch;
    await t.test("each addition has its own expiry; earliest eligible batch is used and old migrations never refill it", async () => {
      await login(teacher, "aal2");
      assert.equal((await one("select adjust_credits($1,1) as n", [student])).n, 3);
      await db.query("update app_settings set credit_validity_months=24 where id=1");
      await db.query("select adjust_credits($1,1)", [student]);
      const batches = (await db.query("select * from credit_batches where student_id=$1 order by expires_at", [student])).rows;
      assert.equal(batches.length, 3);
      assert.ok(Date.parse(batches[2].expires_at) - Date.parse(batches[1].expires_at) > 360 * 86400000);
      await db.exec("reset role");
      // First batch is still available today, but cannot pay for a later lesson.
      await db.query("update credit_batches set expires_at=now()+interval '1 day' where id=$1", [batches[0].id]);
      const day = (await one("select to_char((now() at time zone 'America/Sao_Paulo')::date+4,'YYYY-MM-DD') as day")).day;
      await login(teacher, "aal2");
      const made = await one("select * from teacher_book_lesson($1,$2,'19:00',true,true,$3)", [student, day, randomUUID()]);
      booking = made.booking_id;
      chargedBatch = (await one("select credit_batch_id from bookings where id=$1", [booking])).credit_batch_id;
      assert.equal(chargedBatch, batches[1].id);
      assert.equal((await one("select remaining from credit_batches where id=$1", [chargedBatch])).remaining, 0);
      await db.exec("reset role");
      await db.exec(migration);
      assert.equal((await one("select remaining from credit_batches where id=$1", [chargedBatch])).remaining, 0);
      await login(teacher, "aal2");
      await db.query("select cancel_lesson($1,'Remarcar')", [booking]);
      assert.equal((await one("select remaining from credit_batches where id=$1", [chargedBatch])).remaining, 1);
      await assert.rejects(db.query("select cancel_lesson($1,'De novo')", [booking]), /BOOKING_NOT_FOUND/);
    });
    await t.test("exactly 24h is cancellable; less than 24h is blocked; teacher exception never extends expiry", async () => {
      await db.exec("reset role");
      const makeBooking = async (studentId, batchId, hours) => {
        await db.query("update credit_batches set remaining=remaining-1 where id=$1", [batchId]);
        return (await one("insert into bookings(student_id,starts_at,ends_at,credit_batch_id,credits_used) values($1,now()+make_interval(hours=>$3),now()+make_interval(hours=>$3)+interval '1 hour',$2,1) returning id", [studentId, batchId, hours])).id;
      };
      await login(student);
      await db.exec("reset role; begin");
      const exactly = await makeBooking(student, chargedBatch, 24);
      await db.exec("set role authenticated");
      await db.query("select cancel_lesson($1,'Cancelada pelo aluno')", [exactly]);
      await db.exec("reset role; commit");
      await login(student);
      await db.exec("reset role");
      const late = await makeBooking(student, chargedBatch, 23);
      await db.exec("set role authenticated");
      await assert.rejects(db.query("select cancel_lesson($1,'Cancelada')", [late]), /CANCELLATION_TOO_LATE/);
      await login(other);
      await assert.rejects(db.query("select cancel_lesson($1,'Cancelada')", [late]), /NOT_ALLOWED/);
      await db.exec("reset role");
      await db.query("update credit_batches set added_at=now()-interval '2 years',expires_at=now()-interval '1 second' where student_id=$1", [student]);
      await login(teacher, "aal2");
      await db.query("select cancel_lesson($1,'Exceção da professora')", [late]);
      assert.equal((await one("select credits from profiles where id=$1", [student])).credits, 0);
      assert.ok(Date.parse((await one("select expires_at from credit_batches where id=$1", [chargedBatch])).expires_at) < Date.now());
      const day = (await one("select to_char((now() at time zone 'America/Sao_Paulo')::date+6,'YYYY-MM-DD') as day")).day;
      await assert.rejects(db.query("select * from teacher_book_lesson($1,$2,'19:00',true,true,$3)", [student, day, randomUUID()]), /NO_VALID_CREDITS/);
      const gift = await one("select * from teacher_book_lesson($1,$2,'19:00',false,true,$3)", [student, day, randomUUID()]);
      await db.query("select cancel_lesson($1,'Cancelar oferta')", [gift.booking_id]);
      assert.equal((await one("select credits from profiles where id=$1", [student])).credits, 0);
    });
    await t.test("RLS, MFA, direct-credit protection and cleanup preserve booked contacts", async () => {
      await login(student);
      assert.equal((await db.query("select * from trial_bookings")).rows.length, 0);
      await assert.rejects(db.query("select trial_context($1)", [token]), /permission denied/);
      await assert.rejects(db.query("select renew_trial_link($1,$2)", [contact, hash()]), /NOT_ALLOWED/);
      await assert.rejects(db.query("select adjust_credits($1,1)", [student]), /NOT_ALLOWED/);
      await login(teacher, "aal1");
      await assert.rejects(db.query("select can_convert_contact($1)", [contact]), /MFA_REQUIRED/);
      await login(teacher, "aal2");
      await assert.rejects(db.query("update profiles set credits=999 where id=$1", [student]), /USE_CREDIT_RPC/);
      await assert.rejects(db.query("update profiles set timezone='Europe/Unknown' where id=$1", [student]), /INVALID_TIMEZONE/);
      await db.exec("reset role; set role anon");
      await assert.rejects(db.query("select book_trial($1,now())", [token]), /permission denied/);
      await assert.rejects(db.query("insert into contacts(name,email) values('Bad','bad@test.com')"), /permission denied/);
      await db.exec("reset role");
      await db.query("update contacts set created_at=now()-interval '40 days' where id=$1", [contact]);
      const old = (await one("insert into contacts(name,email,created_at) values('Old','old@test.com',now()-interval '40 days') returning id")).id;
      await db.exec("set role service_role");
      assert.equal((await one("select delete_old_contacts() as n")).n, 1);
      assert.equal((await one("select count(*)::int n from contacts where id=$1", [contact])).n, 1);
      assert.equal((await one("select count(*)::int n from contacts where id=$1", [old])).n, 0);
    });
    await t.test("regular student bookings require credit through the exact end and legacy refunds preserve expiry", async () => {
      await db.exec("reset role");
      await db.exec("update weekly_availability set is_active=true");
      const slot = await one("select (((now() at time zone 'America/Sao_Paulo')::date+7)+time '10:00') at time zone 'America/Sao_Paulo' as start");
      const finish = new Date(Date.parse(slot.start) + 3600000).toISOString();
      await login(student);
      await assert.rejects(db.query("select book_lesson($1)", [slot.start]), /NO_VALID_CREDITS/);
      await login(teacher, "aal2");
      await db.query("select adjust_credits($1,1)", [student]);
      const newBatch = (await one("select id from credit_batches where student_id=$1 and remaining=1 and expires_at>now()", [student])).id;
      await db.exec("reset role");
      await db.query("update credit_batches set expires_at=$2 where id=$1", [newBatch, new Date(Date.parse(finish)-1000).toISOString()]);
      await login(student);
      await assert.rejects(db.query("select book_lesson($1)", [slot.start]), /NO_VALID_CREDITS/);
      await db.exec("reset role");
      await db.query("update credit_batches set expires_at=$2 where id=$1", [newBatch, finish]);
      await login(student);
      const regular = await one("select * from book_lesson($1)", [slot.start]);
      assert.equal(regular.credit_batch_id, newBatch);
      assert.equal((await one("select credits from profiles where id=$1", [student])).credits, 0);
      await db.query("select cancel_lesson($1,'Aluno')", [regular.id]);
      assert.equal((await one("select credits from profiles where id=$1", [student])).credits, 1);
      assert.equal(new Date((await one("select expires_at from credit_batches where id=$1", [newBatch])).expires_at).toISOString(), finish);
      await login(teacher, "aal2");
      const originalExpiry = (await one("select c.expires_at from bookings b join credit_batches c on c.id=b.credit_batch_id where b.id=$1", [legacy])).expires_at;
      await db.query("select cancel_lesson($1,'Legado')", [legacy]);
      assert.equal((await one("select credits from profiles where id=$1", [other])).credits, 1);
      assert.deepEqual((await one("select c.expires_at from bookings b join credit_batches c on c.id=b.credit_batch_id where b.id=$1", [legacy])).expires_at, originalExpiry);
    });
  } finally {
    await db.close();
  }
});
