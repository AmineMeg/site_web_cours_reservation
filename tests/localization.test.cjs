const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./load-typescript.cjs");
const { loadPglite, prepare, PLATFORM } = require("./security/pg-harness.cjs");
const root = path.resolve(__dirname, "..");
const { t } = load("src/lib/i18n/index.ts");
const { en } = load("src/lib/i18n/en.ts");
const { defaultSettings } = load("src/lib/config.ts");
const dates = load("src/lib/dates.ts");
const { generateAvailableSlots } = load("src/lib/slots.ts");
const { homepageDefaults, parseHomepageContent } = load("src/lib/website-content.ts");
const sql = fs.readFileSync(path.join(root, "supabase/portuguese-belo-horizonte.sql"), "utf8");
const migratedContent = JSON.parse(sql.match(/\$homepage\$([\s\S]+?)\$homepage\$/)[1]);
const tz = "America/Sao_Paulo";

test("Brazilian dictionary covers every core key and all homepage migration texts match defaults", () => {
  function compare(a, b) {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
    for (const key of Object.keys(a)) {
      assert.equal(typeof a[key], typeof b[key], key);
      if (a[key] && typeof a[key] === "object") compare(a[key], b[key]);
    }
  }
  compare(en, t);
  assert.equal(t.locale, "pt-BR");
  assert.equal(defaultSettings.timezone, tz);
  assert.deepEqual(parseHomepageContent(migratedContent), { ...migratedContent, heroImage: "", teacherImage: "" });
  const { heroImage, teacherImage, ...textDefaults } = homepageDefaults;
  assert.deepEqual(migratedContent, { ...textDefaults, teacherName: "Professora Teixeira" });
  assert.match(t.emails.credentials.body({ name: "Ana", email: "ana@test.com", url: "https://example.com" }), /Olá, Ana/);
  assert.match(t.common.timezoneNote(tz), /Belo Horizonte/);
});

test("Belo Horizonte conversion, Portuguese dates and slots use UTC-3 across date boundaries", () => {
  assert.equal(dates.localToUtc("2026-10-05", 540, tz).toISOString(), "2026-10-05T12:00:00.000Z");
  assert.equal(dates.localToUtc("2026-01-05", 540, tz).toISOString(), "2026-01-05T12:00:00.000Z");
  assert.equal(dates.todayKey(tz, new Date("2026-10-05T02:00:00Z")), "2026-10-04");
  assert.equal(dates.formatTime("2026-10-05T12:00:00Z", tz), "09:00");
  assert.equal(dates.formatDate("2026-10-05T02:00:00Z", tz), "4 de outubro de 2026");
  assert.equal(dates.weekdayNames()[1], "segunda-feira");
  const weekly = [{ weekday: 1, is_active: true, start_time: "09:00", end_time: "11:00" }];
  const params = { settings: { ...defaultSettings, min_notice_hours: 0, booking_window_days: 1 },
    weekly, blocked: [], busy: [], now: new Date("2026-10-05T03:00:00Z") };
  assert.deepEqual(generateAvailableSlots(params).map(s => s.startsAt), ["2026-10-05T12:00:00.000Z", "2026-10-05T13:00:00.000Z"]);
  assert.equal(generateAvailableSlots({ ...params, blocked: [{ day: "2026-10-05", start_time: "09:00", end_time: "10:00" }] }).length, 1);
  assert.equal(generateAvailableSlots({ ...params, busy: [{ starts_at: "2026-10-05T12:00:00Z", ends_at: "2026-10-05T13:00:00Z" }] }).length, 1);
});

test("landing components render the Portuguese defaults and stored migration content", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  for (const [name, expected] of [
    ["Hero", "Fale espanhol com confiança"],
    ["About", "Conheça sua professora"],
    ["Testimonials", "O que meus alunos dizem"],
  ]) {
    const component = load(`src/components/landing/${name}.tsx`)[name];
    for (const props of [{}, { content: migratedContent }]) {
      const html = renderToStaticMarkup(React.createElement(component, props));
      assert.ok(html.includes(expected));
      assert.doesNotMatch(html, /Meet your teacher|What my students say|Speak Spanish with confidence/);
    }
  }
  const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
  assert.match(layout, /<html lang=\{t.locale\}>/);
});

const PGlite = loadPglite();
test("localization migration replaces stored homepage, changes timezone and preserves existing lessons", {
  skip: PGlite ? false : "Set PGLITE_PATH for SQL tests",
}, async () => {
  const db = new PGlite();
  try {
    await db.exec(PLATFORM);
    await db.exec(prepare(fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8")));
    await db.exec(fs.readFileSync(path.join(root, "supabase/website.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(root, "supabase/student-password-login.sql"), "utf8"));
    const one = async (q, params) => (await db.query(q, params)).rows[0];
    await db.exec("update app_settings set timezone='Europe/Lisbon'; alter table app_settings alter column timezone set default 'Europe/Lisbon';");
    await db.query("insert into website_content(id,content,revision) values('home',$1,7)", [JSON.stringify({ ...homepageDefaults, heroTitle: "Previous customized title" })]);
    const student = (await one("insert into auth.users(email) values('ana@test.com') returning id")).id;
    await db.query("insert into bookings(student_id, starts_at,ends_at) values($1,'2026-10-05T12:00:00Z','2026-10-05T13:00:00Z')", [student]);
    const before = await one("select starts_at,ends_at from bookings");
    await db.exec(sql);
    assert.equal((await one("select timezone from app_settings where id=1")).timezone, tz);
    const home = await one("select content,revision from website_content");
    assert.equal(home.revision, 8);
    assert.deepEqual(home.content, migratedContent);
    assert.deepEqual(await one("select starts_at,ends_at from bookings"), before);
    const column = await one("select column_default from information_schema.columns where table_schema='public' and table_name='app_settings' and column_name='timezone'");
    assert.match(column.column_default, /America\/Sao_Paulo/);
    // Database availability agrees with the frontend: 09:00 local = 12:00 UTC.
    await db.query("update profiles set credits=1 where id=$1", [student]);
    await db.exec("update weekly_availability set is_active=true,start_time='09:00',end_time='11:00'");
    const session = (await one("insert into auth.sessions(user_id) values($1) returning id", [student])).id;
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: student, role: "authenticated", aal: "aal1", session_id: session })]);
    await db.exec("set role authenticated");
    await db.query("select * from security_session_status()");
    const future = await one("select ((date_trunc('day',now() at time zone 'America/Sao_Paulo') + interval '2 days 10 hours') at time zone 'America/Sao_Paulo') slot");
    assert.equal((await one("select is_slot_available($1) available", [future.slot])).available, true);
    await db.query("select book_lesson($1)", [future.slot]);
    assert.equal((await one("select credits from profiles where id=$1", [student])).credits, 0);
    await db.exec("reset role");
    const oldContent = {
      ...migratedContent, siteName: "Espanhol com María", teacherName: "María Fernández",
      aboutParagraph1: "Olá! Sou a María.", heroTitle: "Meu título personalizado",
    };
    await db.query("update website_content set content=$1 where id='home'", [JSON.stringify(oldContent)]);
    const renameSql = fs.readFileSync(path.join(root, "supabase/professora-teixeira.sql"), "utf8");
    await db.exec(renameSql);
    const renamed = await one("select content,revision from website_content");
    assert.equal(renamed.content.siteName, "Espanhol com a Professora Teixeira");
    assert.equal(renamed.content.teacherName, "Professora Teixeira");
    assert.equal(renamed.content.aboutParagraph1, "Olá! Sou a Professora Teixeira.");
    assert.equal(renamed.content.heroTitle, oldContent.heroTitle);
    assert.equal(renamed.revision, 9);
    await db.exec(renameSql);
    assert.deepEqual(await one("select content,revision from website_content"), renamed);
  } finally { await db.close(); }
});
