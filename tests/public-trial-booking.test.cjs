const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createLoader } = require("./load-typescript.cjs");
const { loadPglite, prepare, PLATFORM } = require("./security/pg-harness.cjs");
const PGlite = loadPglite();
const root = path.resolve(__dirname, "..");
const sql = (file) => fs.readFileSync(path.join(root, "supabase", file), "utf8");

test("public calendar shows browser-local slots before the form, then passes the clicked instant unchanged", () => {
  const states = [];
  let cursor = 0, effect;
  const load = createLoader({
    react: {
      ...React,
      useState(initial) {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [states[i], (value) => { states[i] = value; }];
      },
      useEffect(callback) { effect = callback; },
      useMemo(callback) { return callback(); },
    },
    "@/lib/timezones": { browserTimezone: () => "America/New_York" },
    "./ContactForm": { ContactForm: ({ startsAt }) => React.createElement("form", { "data-start": startsAt }) },
  });
  const { TrialOnboarding } = load("src/components/landing/TrialOnboarding.tsx");
  const { homepageDefaults } = load("src/lib/website-content.ts");
  const props = { content: homepageDefaults,
    slots: [{ startsAt: "2026-07-06T03:30:00Z", endsAt: "2026-07-06T04:00:00Z" }] };
  const render = () => { cursor = 0; return TrialOnboarding(props); };
  assert.match(renderToStaticMarkup(render()), /Carregando/);
  effect();
  const tree = render();
  const html = renderToStaticMarkup(tree);
  assert.match(html, />23:30</);
  assert.match(html, /America\/New York/);
  assert.doesNotMatch(html, /<form|<input/);
  const find = (node, predicate) => {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  };
  find(tree, (node) => node.type === "button" && node.props.children === "23:30").props.onClick();
  const chosen = render();
  assert.equal(chosen.props.startsAt, props.slots[0].startsAt);
  assert.equal(chosen.props.timezone, "America/New_York");
  chosen.props.onBack();
  assert.doesNotMatch(renderToStaticMarkup(render()), /<form/);
  props.slots = [];
  assert.match(renderToStaticMarkup(render()), /Não há horários disponíveis/);
});

test("public calendar reports unavailable timezone instead of showing teacher hours", () => {
  const states = [];
  let cursor, effect;
  const load = createLoader({
    react: {
      ...React,
      useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial;
        return [states[i], (value) => { states[i] = value; }]; },
      useEffect(callback) { effect = callback; },
      useMemo(callback) { return callback(); },
    },
    "@/lib/timezones": { browserTimezone: () => { throw new Error("Unavailable"); } },
    "./ContactForm": {},
  });
  const { TrialOnboarding } = load("src/components/landing/TrialOnboarding.tsx");
  const render = () => { cursor = 0; return TrialOnboarding({ content: {}, slots: [] }); };
  render(); effect();
  assert.match(renderToStaticMarkup(render()), /role="alert".*Não conseguimos detectar/);
});

test("public slots loader rejects malformed data and database failures", async () => {
  let result = { data: [{ startsAt: "2026-10-05T12:00:00Z", endsAt: "2026-10-05T12:30:00Z" }], error: null };
  const load = createLoader({
    "server-only": {},
    react: { cache: (fn) => fn },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name) => {
      assert.equal(name, "trial_available_slots"); return result;
    } }) },
  });
  const { getPublicTrialSlots } = load("src/lib/public-trial.ts");
  assert.deepEqual(await getPublicTrialSlots(), result.data);
  const original = console.error;
  console.error = () => {};
  try {
    result = { data: null, error: { code: "missing" } };
    await assert.rejects(getPublicTrialSlots(), /migration/);
    result = { data: [{ startsAt: "2026-10-05T12:00:00Z", endsAt: "2026-10-05T13:00:00Z" }], error: null };
    await assert.rejects(getPublicTrialSlots(), /Invalid/);
  } finally { console.error = original; }
});

test("30-day public trial booking is atomic, service-only, overlap-safe and keeps regular windows unchanged", {
  skip: PGlite ? false : "Set PGLITE_PATH for SQL tests",
}, async (t) => {
  const db = new PGlite();
  const one = async (q, args = []) => (await db.query(q, args)).rows[0];
  const hash = () => randomBytes(32).toString("hex");
  const submit = (email, token, start) => one(
    "select * from submit_trial_booking('Ana',$1,'123','Viajar','Brasil','Nova York','America/New_York',$2,$3)",
    [email, token, start]);
  try {
    await db.exec(PLATFORM);
    await db.exec(prepare(sql("schema.sql")));
    await db.exec(sql("student-password-login.sql"));
    await db.exec(sql("teacher-booking.sql"));
    await db.exec(sql("website.sql"));
    await db.exec(sql("trial-and-credit-rules.sql"));
    const migration = sql("public-trial-booking.sql");
    const defaults = createLoader()("src/lib/website-content.ts").homepageDefaults;
    await db.query("insert into website_content(id,content,revision) values('home',$1,7)", [JSON.stringify({
      ...defaults, heroTitle: "Custom title", contactSubmit: "Enviar meu pedido",
      contactSubtitle: "Conte um pouco sobre você e agende uma aula experimental online gratuita de 30 minutos.",
    })]);
    await db.exec(migration);
    assert.equal((await one("select revision from website_content")).revision, 8);
    const renamed = (await one("select content from website_content")).content;
    assert.equal(renamed.heroTitle, "Custom title");
    assert.equal(renamed.contactSubmit, defaults.contactSubmit);
    assert.equal(renamed.contactSubtitle, defaults.contactSubtitle);
    await db.exec(migration);
    assert.equal((await one("select revision from website_content")).revision, 8);
    await db.exec("update app_settings set min_notice_hours=0, booking_window_days=28, timezone='America/Sao_Paulo'");
    await db.exec("update weekly_availability set is_active=true, start_time='00:00', end_time='23:30'");
    let slots, booking, token;
    await t.test("only anonymous availability timestamps are returned for the exact rolling 30-day horizon", async () => {
      await db.exec("set role service_role");
      slots = (await one("select trial_available_slots() as slots")).slots;
      const now = (await one("select now() as n")).n.getTime();
      assert.ok(slots.length > 0);
      for (const slot of slots) {
        assert.deepEqual(Object.keys(slot).sort(), ["endsAt", "startsAt"]);
        assert.equal(Date.parse(slot.endsAt) - Date.parse(slot.startsAt), 1800000);
        assert.ok(Date.parse(slot.startsAt) >= now);
        assert.ok(Date.parse(slot.startsAt) <= now + 30 * 86400000);
      }
      assert.ok(slots.some((s) => Date.parse(s.startsAt) > now + 29 * 86400000));
      await db.exec("reset role");
      const late = slots.find((s) => Date.parse(s.startsAt) > now + 29 * 86400000);
      assert.equal((await one("select duration_slot_available($1,30) as ok", [late.startsAt])).ok, false);
      assert.equal((await one("select duration_slot_available($1,30,30) as ok", [late.startsAt])).ok, true);
      assert.equal((await one("select duration_slot_available(now()+interval '30 days 1 second',30,30) as ok")).ok, false);
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query("select trial_available_slots()"), /permission denied/);
        await assert.rejects(submit("unauthorized@test.com", hash(), late.startsAt), /permission denied/);
        await db.exec("reset role");
      }
    });
    await t.test("the exact 30-day boundary is accepted but one microsecond later is rejected", async () => {
      await db.exec("begin");
      try {
        await db.exec(`update app_settings set timezone =
          case when extract(hour from now() at time zone 'UTC') < 22 then 'UTC' else 'Etc/GMT+12' end;
          update weekly_availability set start_time = (now() at time zone (select timezone from app_settings where id=1))::time,
            end_time = '23:59:59'`);
        assert.equal((await one("select duration_slot_available(now()+interval '30 days',30,30) as ok")).ok, true);
        assert.equal((await one("select duration_slot_available(now()+interval '30 days 0.000001 seconds',30,30) as ok")).ok, false);
      } finally { await db.exec("rollback"); }
    });
    await t.test("contact, hash link and 30-minute trial are committed together without creating users", async () => {
      await db.exec("set role service_role");
      token = hash();
      booking = await submit("booked@test.com", token, slots[0].startsAt);
      assert.equal(booking.ends_at.getTime() - booking.starts_at.getTime(), 1800000);
      const context = (await one("select trial_context($1) as context", [token])).context;
      assert.equal(context.booking.id, booking.id);
      assert.equal(context.contact.timezone, "America/New_York");
      assert.ok(!context.slots.some((s) => s.startsAt === slots[0].startsAt));
      assert.equal((await one("select extract(epoch from (l.expires_at-c.created_at)) as seconds from trial_links l join contacts c on c.id=l.contact_id where token_hash=$1", [token])).seconds, "604800.000000");
      await db.exec("reset role");
      assert.equal((await one("select count(*)::int n from auth.users")).n, 0);
    });
    await t.test("contending bookings cannot overlap or leave orphan contacts; duplicate submissions do not book twice", async () => {
      await db.exec("set role service_role");
      const results = await Promise.allSettled([
        submit("race-a@test.com", hash(), slots[2].startsAt),
        submit("race-b@test.com", hash(), slots[2].startsAt),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.match(results.find((r) => r.status === "rejected").reason.message, /SLOT_NOT_AVAILABLE/);
      await assert.rejects(submit("booked@test.com", hash(), slots[4].startsAt), /TRIAL_ALREADY_BOOKED/);
      await db.exec("reset role");
      assert.equal((await one("select count(*)::int n from contacts")).n, 2);
      assert.equal((await one("select count(*)::int n from trial_bookings")).n, 2);
    });
    await t.test("an old unbooked invitation can book directly, while failures restore the previous link", async () => {
      await db.exec("set role service_role");
      const old = hash();
      await one("select issue_trial_link('Ana','old@test.com','','','Brasil','NYC','America/New_York',$1)", [old]);
      const fresh = hash();
      await submit("old@test.com", fresh, slots[6].startsAt);
      await assert.rejects(db.query("select trial_context($1)", [old]), /LINK_EXPIRED/);
      await db.exec("reset role");
      await db.exec("create function fail_trial_test() returns trigger language plpgsql as $$ begin raise exception 'TEST_INSERT_FAILED'; end $$");
      await db.exec("create trigger fail_trial_test before insert on trial_bookings for each row execute function fail_trial_test()");
      await db.exec("set role service_role");
      const rollbackToken = hash();
      await one("select issue_trial_link('Ana','rollback@test.com','','','Brasil','NYC','America/New_York',$1)", [rollbackToken]);
      await assert.rejects(submit("rollback@test.com", hash(), slots[8].startsAt), /TEST_INSERT_FAILED/);
      assert.ok((await one("select trial_context($1) as context", [rollbackToken])).context);
      await assert.rejects(submit("failed@test.com", hash(), slots[8].startsAt), /TEST_INSERT_FAILED/);
      await db.exec("reset role");
      assert.equal((await one("select count(*)::int n from contacts where email='failed@test.com'")).n, 0);
      await db.exec("drop trigger fail_trial_test on trial_bookings; drop function fail_trial_test()");
    });
    await t.test("blocks and existing regular lessons are hidden from the public calendar", async () => {
      const start = slots[10].startsAt;
      const day = (await one("select ($1::timestamptz at time zone 'America/Sao_Paulo')::date as d", [start])).d;
      await db.query("insert into blocked_slots(day) values($1)", [day]);
      const student = (await one("insert into auth.users(email) values('student@test.com') returning id")).id;
      await db.query("insert into bookings(student_id, starts_at, ends_at) values($1,$2,$2::timestamptz+interval '1 hour')",
        [student, slots[100].startsAt]);
      await db.exec("set role service_role");
      const filtered = (await one("select trial_available_slots() as slots")).slots;
      assert.ok(!filtered.some((s) => s.startsAt === start));
      assert.ok(!filtered.some((s) => s.startsAt === slots[100].startsAt));
    });
  } finally { await db.close(); }
});
