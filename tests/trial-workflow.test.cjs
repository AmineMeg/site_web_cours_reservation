const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createLoader } = require("./load-typescript.cjs");
const token = "a".repeat(64);
const contact = { id: "contact", name: "Ana", email: "ana@test.com", phone: "123", message: "Viajar",
  country: "France", city: "Paris", timezone: "Europe/Paris", converted_at: null, trial_declined_at: null };

function form(values = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "Ana", email: "ANA@test.com", country: "France", timezone: "Europe/Paris",
    startsAt: "2026-10-05T12:00:00Z", ...values })) data.set(key, value);
  return data;
}

test("contact action books atomically, validates location/slot, rate-limits and sends confirmation without Auth users", async () => {
  const calls = [], emails = [];
  let allowed = true, delivery = true, error = null;
  const load = createLoader({
    "server-only": {},
    "next/cache": { revalidatePath() {} },
    "@/lib/auth": { getSettings: async () => ({ timezone: "America/Sao_Paulo" }) },
    "@/lib/security/rate-limit": { limitTrialContact: async (email) => { calls.push(["rate", email]); return allowed; } },
    "@/lib/supabase/admin": { createAdminClient: () => ({
      rpc: async (name, data) => { calls.push([name, data]); return {
        data: error ? null : { id: "trial", starts_at: data.p_start, ends_at: "2026-10-05T12:30:00Z" }, error,
      }; },
      auth: { admin: { generateLink: () => { throw new Error("No trial Auth accounts"); } } },
    }) },
    "@/lib/notifications": {
      sendTrialBookingEmails: async (data) => { emails.push(data); return { ok: delivery }; },
      notifyTeacherNewContact: async () => ({ ok: true }),
    },
  });
  const { submitContact } = load("src/app/actions/contact.ts");
  assert.equal((await submitContact({}, form({ timezone: "Europe/Bad" }))).status, "error");
  assert.equal((await submitContact({}, form({ startsAt: "" }))).errors.slot.length > 0, true);
  assert.equal((await submitContact({}, form({ startsAt: "not-a-date" }))).status, "error");
  assert.equal(calls.length, 0);
  allowed = false;
  assert.equal((await submitContact({}, form())).status, "error");
  assert.equal(emails.length, 0);
  allowed = true;
  assert.equal((await submitContact({}, form())).status, "success");
  assert.equal(calls.at(-1)[0], "submit_trial_booking");
  assert.equal(calls.at(-1)[1].p_email, "ana@test.com");
  assert.equal(calls.at(-1)[1].p_timezone, "Europe/Paris");
  assert.equal(calls.at(-1)[1].p_city, "");
  const { trialHash } = load("src/lib/trial.ts");
  assert.equal(calls.at(-1)[1].p_hash, trialHash(emails[0].token));
  assert.notEqual(calls.at(-1)[1].p_hash, emails[0].token);
  assert.equal(calls.at(-1)[1].p_start, "2026-10-05T12:00:00Z");
  assert.match(emails[0].when, /14:00.*Europe\/Paris/);
  assert.match(emails[0].teacherWhen, /09:00.*America\/Sao Paulo/);
  assert.equal(trialHash("bad"), null);
  delivery = false;
  const saved = await submitContact({}, form());
  assert.equal(saved.status, "success");
  assert.match(saved.message, /não conseguimos enviar/);
  assert.equal(saved.booking.timezone, "Europe/Paris");
  assert.equal(saved.trialUrl, `/trial/${emails.at(-1).token}`);
  error = { message: "SLOT_NOT_AVAILABLE", code: "P0001" };
  const before = emails.length;
  const stale = await submitContact({}, form());
  assert.equal(stale.status, "error");
  assert.ok(stale.errors.slot);
  assert.equal(emails.length, before);
});

test("trial action relies on token-scoped RPCs, uses each recipient's timezone and reports saved-but-email-failed", async () => {
  const rpcCalls = [], emails = [], invalidations = [];
  let error = null, delivery = false;
  const booking = { id: "trial", starts_at: "2026-10-05T00:30:00Z", ends_at: "2026-10-05T01:00:00Z", contact_id: "contact" };
  const load = createLoader({
    "server-only": {},
    "next/cache": { revalidatePath: (...data) => invalidations.push(data) },
    "@/lib/auth": { getSettings: async () => ({ timezone: "America/Sao_Paulo" }) },
    "@/lib/security/rate-limit": { consumeRateLimit: async () => true },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name, params) => {
      rpcCalls.push([name, params]);
      return name === "trial_context" ? { data: { contact, booking: null, slots: [] }, error: null }
        : { data: error ? null : booking, error };
    } }) },
    "@/lib/notifications": { sendTrialBookingEmails: async (data) => { emails.push(data); return { ok: delivery }; } },
  });
  const { changeTrial } = load("src/app/trial/[token]/actions.ts");
  assert.equal((await changeTrial("bad", booking.starts_at)).ok, false);
  assert.equal(rpcCalls.length, 0);
  const made = await changeTrial(token, booking.starts_at);
  assert.equal(made.ok, true);
  assert.match(made.message, /e-mail não foi enviado/);
  assert.equal(rpcCalls[1][0], "book_trial");
  assert.notEqual(rpcCalls[1][1].p_hash, token);
  assert.match(emails[0].when, /Europe\/Paris, UTC\+02:00/);
  assert.match(emails[0].teacherWhen, /America\/Sao Paulo, UTC-03:00/);
  assert.ok(invalidations.some(([value]) => value === "/admin"));
  error = { code: "P0001", message: "CANCELLATION_TOO_LATE" };
  assert.equal((await changeTrial(token, null)).ok, false);
  assert.equal(emails.length, 1);
  error = null; delivery = true;
  assert.equal((await changeTrial(token, null)).ok, true);
  assert.equal(emails[1].cancelled, true);
});

test("teacher account creation checks the database start gate before any Auth user operation", async () => {
  let allowed = false, generated = 0, profileUpdate;
  const query = { select() { return this; }, eq() { return this; }, is() { return this; },
    update() { return this; }, maybeSingle: async () => ({ data: contact }), single: async () => ({ data: { id: contact.id }, error: null }) };
  const load = createLoader({
    "server-only": {},
    "next/cache": { revalidatePath() {} },
    "@/lib/auth": {
      requireTeacher: async () => ({ supabase: { from: () => query,
        rpc: async () => ({ data: allowed, error: null }) } }),
      requireRecentAuthentication: async () => {},
    },
    "@/lib/email": { emailIsConfigured: () => true },
    "@/lib/auth-links": { accountSiteUrl: () => "https://example.com", confirmationLink: () => "https://example.com/auth/confirm" },
    "@/lib/supabase/admin": { createAdminClient: () => ({
      auth: { admin: { generateLink: async () => { generated++; return { data: { user: { id: "student" }, properties: { hashed_token: "x" } }, error: null }; } } },
      from: () => ({ update: (data) => { profileUpdate = data; return query; } }),
    }) },
    "@/lib/notifications": { sendStudentInvitation: async () => ({ ok: true }) },
  });
  const { createStudentFromContact } = load("src/app/admin/actions.ts");
  assert.equal((await createStudentFromContact(contact.id)).ok, false);
  assert.equal(generated, 0);
  allowed = true;
  assert.equal((await createStudentFromContact(contact.id)).ok, true);
  assert.equal(generated, 1);
  assert.equal(profileUpdate.timezone, contact.timezone);
  assert.equal(profileUpdate.country, contact.country);
  assert.equal(Object.hasOwn(profileUpdate, "credits"), false);
});

test("student cancellation uses the authenticated RPC, not a client-side deadline, and tells each party their local time", async () => {
  let error = { message: "CANCELLATION_TOO_LATE" };
  const emails = [], invalidations = [];
  const load = createLoader({
    "server-only": {},
    "next/cache": { revalidatePath: (...value) => invalidations.push(value) },
    "@/lib/auth": {
      requireStudent: async () => ({ profile: { full_name: "Ana", email: contact.email, timezone: "Europe/Paris" },
        supabase: { rpc: async () => ({ error, data: error ? null : { starts_at: "2026-10-05T12:00:00Z", credits_used: 1 } }) } }),
      getSettings: async () => ({ timezone: "America/Sao_Paulo" }),
    },
    "@/lib/notifications": {
      sendCancellationNotice: async (data) => { emails.push(data); return { ok: true }; },
      sendStudentMessageToTeacher: async (data) => { emails.push(data); return { ok: true }; },
    },
  });
  const { cancelMyLesson } = load("src/app/dashboard/actions.ts");
  assert.equal((await cancelMyLesson("booking")).ok, false);
  assert.equal(emails.length, 0);
  error = null;
  assert.equal((await cancelMyLesson("booking")).ok, true);
  assert.equal(emails[0].byStudent, true);
  assert.match(emails[0].when, /14:00.*Europe\/Paris/);
  assert.match(emails[1].message, /09:00.*America\/Sao Paulo/);
  assert.ok(invalidations.some(([value]) => value === "/admin"));
});

test("public and admin surfaces show policy, location fields, trial labels and a disabled pre-trial account button", () => {
  const load = createLoader({
    "server-only": {},
    "@/app/actions/contact": { submitContact() {} },
    "@/app/admin/actions": {},
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
  });
  const { ContactForm } = load("src/components/landing/ContactForm.tsx");
  const formHtml = renderToStaticMarkup(React.createElement(ContactForm));
  for (const name of ["country", "timezone"]) assert.match(formHtml, new RegExp(`name="${name}"`));
  assert.doesNotMatch(formHtml, /name="city"|Cidade/);
  assert.match(formHtml, /name="country"[^>]*value="Brasil"/);
  assert.match(formHtml, /type="hidden" name="timezone"/);
  assert.doesNotMatch(formHtml, /<select/);
  assert.match(formHtml, /Preencha seus dados para confirmar/);
  const { ContactCard } = load("src/components/admin/ContactCard.tsx");
  const html = renderToStaticMarkup(React.createElement(ContactCard, { contact, receivedLabel: "hoje", daysLeft: 30,
    now: Date.parse("2026-10-04T12:00:00Z"), timezone: "America/Sao_Paulo", hasTrialHistory: true,
    trial: { id: "trial", starts_at: "2026-10-05T12:00:00Z" } }));
  assert.match(html, /<button[^>]+disabled=""[^>]*>✅ Criar conta de aluno/);
  assert.match(html, /Aula experimental gratuita · 30 minutos/);
  assert.doesNotMatch(html, /Paris, France/);
  assert.match(html, /🗑️ Ocultar contato/);
});

test("student and teacher profile forms omit city and updates preserve historical city data", async () => {
  const updates = [];
  const profile = { id: "student", ...contact, full_name: "Ana", objectives: "", role: "student", is_active: true };
  const supabase = { from: (table) => {
    assert.equal(table, "profiles");
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }),
      update: (payload) => ({ eq: async () => { updates.push(payload); return { error: null }; } }),
    };
  } };
  const load = createLoader({
    "server-only": {},
    "next/cache": { revalidatePath() {} },
    "@/lib/auth": {
      requireStudent: async () => ({ supabase, profile }),
      requireTeacher: async () => ({ supabase, profile: { role: "teacher" } }),
      requireRecentAuthentication: async () => ({}),
    },
    "@/components/SecurityPasswordForm": { SecurityPasswordForm: () => null },
  });
  const { ProfileForm } = load("src/components/dashboard/ProfileForm.tsx");
  const { StudentEditForm } = load("src/components/admin/StudentEditForm.tsx");
  for (const html of [
    renderToStaticMarkup(React.createElement(ProfileForm, { profile })),
    renderToStaticMarkup(React.createElement(StudentEditForm, { student: profile })),
  ]) {
    assert.match(html, /name="country"/);
    assert.doesNotMatch(html, /name="city"|Cidade/);
  }
  const data = form({ id: profile.id, full_name: "Ana", is_active: "on", country: "Brasil" });
  assert.equal((await load("src/app/dashboard/actions.ts").updateMyProfile(null, data)).ok, true);
  assert.equal((await load("src/app/admin/actions.ts").updateStudent(null, data)).ok, true);
  assert.equal(updates.length, 2);
  for (const update of updates) {
    assert.equal(update.country, "Brasil");
    assert.equal(update.timezone, "Europe/Paris");
    assert.equal(Object.hasOwn(update, "city"), false);
  }
});

test("regular and trial calendars show New York local hours and dates rather than teacher day keys", () => {
  const load = createLoader({
    "@/app/dashboard/actions": {},
    "@/app/trial/[token]/actions": {},
  });
  const { BookingCalendar } = load("src/components/dashboard/BookingCalendar.tsx");
  const { TrialCalendar } = load("src/components/TrialCalendar.tsx");
  const { dayKeyOf, formatDayKey } = load("src/lib/dates.ts");
  const startsAt = "2026-07-06T03:30:00Z";
  const slot = { startsAt, endsAt: "2026-07-06T04:30:00Z", dayKey: "2026-07-06", startMinutes: 30 };
  const regular = renderToStaticMarkup(React.createElement(BookingCalendar, {
    slots: [slot], credits: 1, timezone: "America/New_York",
  }));
  assert.match(regular, />23:30</);
  assert.match(regular, /text-2xl">5</);
  assert.doesNotMatch(regular, />00:30</);
  const trial = renderToStaticMarkup(React.createElement(TrialCalendar, {
    token, slots: [slot], timezone: "America/New_York", booking: null,
  }));
  assert.match(trial, />23:30</);
  const day = dayKeyOf(startsAt, "America/New_York");
  assert.equal(day, "2026-07-05");
  assert.ok(trial.includes(formatDayKey(day, { weekday: "long", day: "numeric", month: "long" })));
  const winter = renderToStaticMarkup(React.createElement(TrialCalendar, {
    token, slots: [{ startsAt: "2026-12-06T03:30:00Z", endsAt: "2026-12-06T04:00:00Z" }],
    timezone: "America/New_York", booking: null,
  }));
  assert.match(winter, />22:30</);
});

test("location fields detect browser timezone without replacing the student's zone in admin", () => {
  let states, cursor, effect;
  let detectionError = false;
  const load = createLoader({
    react: {
      ...React,
      useState(initial) {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value) => { states[index] = value; }];
      },
      useEffect(callback) { effect = callback; },
    },
    "@/lib/timezones": { browserTimezone: () => {
      if (detectionError) throw new Error("Timezone unavailable");
      return "Asia/Tokyo";
    } },
  });
  const { LocationFields } = load("src/components/LocationFields.tsx");
  const render = (props) => {
    cursor = 0;
    return renderToStaticMarkup(LocationFields(props));
  };
  states = [];
  render({ initial: contact });
  effect();
  assert.match(render({ initial: contact }), /name="timezone" value="Asia\/Tokyo"/);
  states = [];
  render({ initial: contact, detectTimezone: false });
  effect();
  const html = render({ initial: contact, detectTimezone: false });
  assert.match(html, /<select name="timezone"/);
  assert.match(html, /value="Europe\/Paris" selected/);
  assert.match(html, /name="country"[^>]*value="France"/);
  states = [];
  const preview = render({ preview: true });
  assert.match(preview, /Brasil/);
  assert.doesNotMatch(preview, /<input|<select/);
  states = [];
  detectionError = true;
  render({});
  effect();
  const failed = render({});
  assert.match(failed, /role="alert"/);
  assert.match(failed, /name="timezone" value=""/);
  assert.match(failed, /Não conseguimos detectar/);
});
