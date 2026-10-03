const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createLoader, load } = require("./load-typescript.cjs");
const { homepageDefaults } = load("src/lib/website-content.ts");
const { loadPglite, prepare, PLATFORM } = require("./security/pg-harness.cjs");

test("public testimonials show only supplied student reviews and never stored fictional quotes or ratings", () => {
  const { Testimonials } = load("src/components/landing/Testimonials.tsx");
  assert.equal(renderToStaticMarkup(React.createElement(Testimonials, { content: homepageDefaults })), "");
  const review = { id: "r1", display_name: "Ana <script>", quote: "Minha experiência real <img onerror=bad()>" };
  const html = renderToStaticMarkup(React.createElement(Testimonials, { content: homepageDefaults, reviews: [review] }));
  assert.match(html, /Ana &lt;script&gt;/);
  assert.match(html, /Minha experiência real &lt;img/);
  assert.doesNotMatch(html, /★★★★★|<script>|testimonial1Quote|Editar:/);
  assert.ok(!html.includes(homepageDefaults.testimonial1Quote));
  const preview = renderToStaticMarkup(React.createElement(Testimonials, { content: homepageDefaults, preview: true }));
  assert.match(preview, /depoimentos reais/);
  assert.ok(!preview.includes(homepageDefaults.testimonial1Quote));
});

test("review actions authenticate first and require explicit consent and exact text limits", async () => {
  const calls = [];
  const revalidated = [];
  const actions = createLoader({
    "@/lib/auth": { requireStudent: async () => ({ supabase: { rpc: async (name, args) => { calls.push({ name, args }); return {}; } } }) },
    "next/cache": { revalidatePath: path => revalidated.push(path) },
  })("src/app/dashboard/review/actions.ts");
  const form = (name, quote, consent) => {
    const value = new FormData(); value.set("name", name); value.set("quote", quote); if (consent) value.set("consent", "on"); return value;
  };
  for (const [name, quote, consent] of [["Ana", "x".repeat(20), false], ["", "x".repeat(20), true],
    ["x".repeat(81), "x".repeat(20), true], ["Ana", "x".repeat(19), true], ["Ana", "x".repeat(2001), true]]) {
    assert.equal((await actions.submitReview(null, form(name, quote, consent))).ok, false);
  }
  assert.equal(calls.length, 0);
  assert.equal((await actions.submitReview(null, form(" Ana ", "x".repeat(2000), true))).ok, true);
  assert.deepEqual(calls[0].args, { p_name: "Ana", p_quote: "x".repeat(2000), p_consent: true });
  assert.equal((await actions.withdrawReview(null, new FormData())).ok, true);
  assert.equal(calls[1].name, "withdraw_student_review");
  assert.ok(revalidated.includes("/"));
  const unauthorized = createLoader({
    "@/lib/auth": { requireStudent: async () => { throw new Error("Session required"); } },
    "next/cache": { revalidatePath() {} },
  })("src/app/dashboard/review/actions.ts");
  await assert.rejects(unauthorized.submitReview(null, form("Ana", "x".repeat(20), true)), /Session required/);
});

test("moderation is teacher-only and uses a revision timestamp rather than rewriting student content", async () => {
  const calls = [];
  const actions = createLoader({
    "@/lib/auth": { requireTeacher: async () => ({ supabase: { rpc: async (name, args) => { calls.push({ name, args }); return {}; } } }) },
    "next/cache": { revalidatePath() {} },
  })("src/app/admin/reviews/actions.ts");
  const form = new FormData();
  form.set("id", "12345678-1234-4123-8123-123456789abc");
  form.set("updated", "2026-10-03T10:00:00Z");
  form.set("status", "approved");
  assert.equal((await actions.moderateReview(null, form)).ok, true);
  assert.deepEqual(calls[0], { name: "moderate_student_review", args: { p_id: form.get("id"), p_updated_at: form.get("updated"), p_status: "approved" } });
  form.set("status", "withdrawn");
  assert.equal((await actions.moderateReview(null, form)).ok, false);
  assert.equal(calls.length, 1);
});

test("review invitation email is Portuguese HTML presentation with login link and stable deduplication key", async () => {
  let sent;
  const notifications = createLoader({
    "server-only": {},
    "@/lib/email": { sendEmail: async payload => { sent = payload; return { ok: true }; } },
  })("src/lib/notifications.ts");
  await notifications.sendReviewInvitation({ id: "student-1", name: "Ana", email: "ana@example.test" });
  assert.match(sent.subject, /5 aulas/);
  assert.match(sent.presentation.action.url, /\/dashboard\/review$/);
  assert.match(sent.text, /opcional/);
  assert.equal(sent.idempotencyKey, "review-invitation-student-1");
  assert.ok(sent.presentation.note.includes("autorização"));
});

test("email worker claims a bounded batch and records failures without marking them sent", async () => {
  const finishes = [];
  const loader = createLoader({
    "server-only": {},
    "@/lib/email": { emailIsConfigured: () => true },
    "@/lib/notifications": { sendReviewInvitation: async p => ({ ok: p.id !== "failure" }) },
  });
  const worker = loader("src/lib/review-emails.ts");
  const supabase = { rpc: async (name, args) => {
    if (name === "claim_review_emails") return { data: [
      { student_id: "success", email: "a@example.test", full_name: "Ana", lease_token: "lease1" },
      { student_id: "failure", email: "b@example.test", full_name: "Bia", lease_token: "lease2" },
    ] };
    finishes.push(args); return {};
  } };
  assert.deepEqual(await worker.sendDueReviewInvitations(supabase), { claimed: 2, sent: 1, failed: 1 });
  assert.equal(finishes.find(x => x.p_student === "failure").p_sent, false);
  assert.equal(finishes.find(x => x.p_student === "success").p_sent, true);
  const unconfigured = createLoader({
    "server-only": {},
    "@/lib/email": { emailIsConfigured: () => false },
    "@/lib/notifications": { sendReviewInvitation: async () => { throw new Error("Must not send"); } },
  })("src/lib/review-emails.ts");
  await assert.rejects(unconfigured.sendDueReviewInvitations({
    rpc: async () => { throw new Error("Must not claim without a provider"); },
  }), /not configured/);
});

test("invitation cron requires its secret before any service-role database access", async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-cron-secret";
  let calls = 0;
  try {
    const { GET } = createLoader({
      "@/lib/supabase/admin": { createAdminClient: () => { calls++; return {}; } },
      "@/lib/review-emails": { sendDueReviewInvitations: async () => ({ claimed: 1, sent: 0, failed: 1 }) },
    })("src/app/api/cron/review-invitations/route.ts");
    assert.equal((await GET(new Request("http://localhost"))).status, 401);
    assert.equal(calls, 0);
    assert.equal((await GET(new Request("http://localhost", { headers: { authorization: "Bearer test-cron-secret" } }))).status, 500);
    assert.equal(calls, 1);
  } finally {
    if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original;
  }
});

test("review invitation destination survives login without permitting external redirects or bypassing security", async () => {
  const destinations = [];
  const auth = createLoader({
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { signInWithPassword: async () => ({ data: { user: { id: "student" } } }) },
    }) },
    "@/lib/auth": { fetchSecurityStatus: async () => ({ accountState: "active", sessionOk: true }) },
    "@/lib/turnstile": { verifyTurnstile: async () => true },
    "@/lib/security/rate-limit": { limitLogin: async () => true, resetLoginLimit: async () => {} },
    "@/lib/security/audit": { auditEmailHash: () => "", logSecurityEvent: async () => {} },
    "next/navigation": { redirect: target => { destinations.push(target); throw new Error("redirect"); } },
  })("src/app/actions/auth.ts");
  for (const next of ["/dashboard/review", "https://evil.test", "//evil.test", "/login", ""]) {
    const form = new FormData();
    form.set("email", "ana@example.test"); form.set("password", "password"); form.set("next", next);
    await assert.rejects(auth.signIn({ message: "" }, form), /redirect/);
  }
  assert.deepEqual(destinations, ["/security?next=%2Fdashboard%2Freview", "/security", "/security", "/security", "/security"]);
  const middleware = createLoader({
    "@supabase/ssr": { createServerClient: () => ({ auth: { getClaims: async () => ({ data: {} }) } }) },
    "./env": { supabaseUrl: () => "https://project.supabase.co", supabaseAnonKey: () => "test-key" },
  })("src/lib/supabase/middleware.ts");
  const { NextRequest } = require("next/server");
  const response = await middleware.updateSession(new NextRequest("https://site.example/dashboard/review"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://site.example/login?next=%2Fdashboard%2Freview");
});

const PGlite = loadPglite();
test("reviews SQL enforces fifth-ended-lesson eligibility, consent, ownership, approval and leased email retries", {
  skip: PGlite ? false : "Set PGLITE_PATH for SQL tests",
}, async () => {
  const db = new PGlite();
  const root = path.resolve(__dirname, "..");
  try {
    await db.exec(PLATFORM);
    await db.exec(prepare(fs.readFileSync(path.join(root, "supabase/schema.sql"), "utf8")));
    await db.exec(fs.readFileSync(path.join(root, "supabase/student-password-login.sql"), "utf8"));
    await db.exec(fs.readFileSync(path.join(root, "supabase/teacher-booking.sql"), "utf8"));
    const migration = fs.readFileSync(path.join(root, "supabase/student-reviews.sql"), "utf8");
    await db.exec(migration); await db.exec(migration);
    const one = async (q, params) => (await db.query(q, params)).rows[0];
    const student = (await one("insert into auth.users(email) values('ana@example.test') returning id")).id;
    const other = (await one("insert into auth.users(email) values('bia@example.test') returning id")).id;
    const teacher = (await one("insert into auth.users(email) values('teacher@example.test') returning id")).id;
    await db.query("update profiles set role='teacher' where id=$1", [teacher]);
    await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')", [teacher]);
    async function login(id, aal = "aal1") {
      await db.exec("reset role");
      const sid = (await one("insert into auth.sessions(user_id) values($1) returning id", [id])).id;
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({
        sub: id, role: "authenticated", aal, session_id: sid,
        amr: aal === "aal2" ? [{ method: "totp", timestamp: Math.floor(Date.now()/1000) }] : [],
      })]);
      await db.exec("set role authenticated");
      await db.query("select * from security_session_status()");
    }
    async function lessons(id, count) {
      await db.exec("reset role");
      for (let i=0;i<count;i++) {
        await db.query(`insert into bookings(student_id,starts_at,ends_at)
          values($1,now()-interval '10 days'+($2*interval '2 hours'),now()-interval '10 days'+($2*interval '2 hours')+interval '1 hour')`, [id,i]);
      }
    }
    await lessons(student, 4);
    await login(student);
    assert.equal((await one("select * from get_my_review_state()")).eligible, false);
    await assert.rejects(db.query("select submit_student_review('Ana',$1,true)", ["Aulas excelentes e muito claras!"]), /NOT_ELIGIBLE/);
    await db.exec("reset role");
    await db.query("insert into bookings(student_id,starts_at,ends_at,status) values($1,now()-interval '20 days',now()-interval '20 days'+interval '1 hour','cancelled')", [student]);
    await db.query("insert into bookings(student_id,starts_at,ends_at) values($1,now()+interval '1 day',now()+interval '1 day 1 hour')", [student]);
    await login(student);
    assert.equal((await one("select * from get_my_review_state()")).eligible, false);
    await db.exec("reset role");
    await db.query("insert into bookings(student_id,starts_at,ends_at) values($1,now()-interval '1 hour',now()+interval '1 hour')", [student]);
    await login(student);
    assert.equal((await one("select * from get_my_review_state()")).eligible, false);
    await db.exec("reset role");
    await db.query("update bookings set starts_at=now()-interval '3 hours',ends_at=now()-interval '2 hours',credits_used=0 where student_id=$1 and ends_at>now() and starts_at<now()", [student]);
    await login(student);
    assert.equal((await one("select * from get_my_review_state()")).eligible, true);
    await assert.rejects(db.query("select submit_student_review('Ana',$1,false)", ["Aulas excelentes e muito claras!"]), /INVALID_REVIEW/);
    await assert.rejects(db.query("select claim_review_emails()"), /permission denied/);
    await db.exec("reset role; set role service_role");
    const claim = await one("select * from claim_review_emails()");
    assert.equal(claim.student_id, student);
    assert.equal((await db.query("select * from claim_review_emails()")).rows.length, 0);
    await assert.rejects(db.query("select finish_review_email($1,gen_random_uuid(),true)", [student]), /EMAIL_LEASE_CONFLICT/);
    await db.query("select finish_review_email($1,$2,false)", [student, claim.lease_token]);
    assert.equal((await db.query("select * from claim_review_emails()")).rows.length, 0);
    await db.query("update review_email_requests set last_attempt_at=now()-interval '1 day' where student_id=$1", [student]);
    const retry = await one("select * from claim_review_emails()");
    await db.query("select finish_review_email($1,$2,true)", [student, retry.lease_token]);
    assert.equal((await db.query("select * from claim_review_emails()")).rows.length, 0);
    await login(student);
    await db.query("select submit_student_review('Ana',$1,true)", ["Aulas excelentes e muito claras!"]);
    const review = await one("select * from student_reviews");
    assert.equal(review.status, "pending");
    assert.equal((await db.query("select * from get_public_reviews()")).rows.length, 0);
    await assert.rejects(db.query("update student_reviews set status='approved'"), /permission denied/);
    await assert.rejects(db.query("select submit_student_review('Ana',$1,true)", ["Aulas excelentes e muito claras!"]), /duplicate key/);
    await assert.rejects(db.query("select moderate_student_review($1,'approved',$2)", [review.id,review.updated_at]), /NOT_ALLOWED/);
    await login(other);
    assert.equal((await db.query("select * from student_reviews")).rows.length, 0);
    await assert.rejects(db.query("select withdraw_student_review()"), /REVIEW_CONFLICT/);
    await login(teacher);
    await assert.rejects(db.query("select moderate_student_review($1,'approved',$2)", [review.id,review.updated_at]), /NOT_ALLOWED/);
    await login(teacher, "aal2");
    await db.query("select moderate_student_review($1,'approved',$2)", [review.id,review.updated_at]);
    await assert.rejects(db.query("select moderate_student_review($1,'rejected',$2)", [review.id,review.updated_at]), /REVIEW_CONFLICT/);
    const published = (await db.query("select * from get_public_reviews()")).rows;
    assert.deepEqual(Object.keys(published[0]).sort(), ["id","display_name","quote"].sort());
    await db.exec("reset role");
    await db.query("update profiles set is_active=false where id=$1", [student]);
    assert.equal((await db.query("select * from get_public_reviews()")).rows.length, 0);
    await db.query("update profiles set is_active=true where id=$1", [student]);
    await db.exec("reset role; set role anon");
    assert.equal((await db.query("select * from get_public_reviews()")).rows.length, 1);
    await assert.rejects(db.query("select * from student_reviews"), /permission denied/);
    await assert.rejects(db.query("select * from review_email_requests"), /permission denied/);
    await login(student);
    await db.query("select withdraw_student_review()");
    const withdrawn = await one("select * from student_reviews");
    assert.equal((await db.query("select * from get_public_reviews()")).rows.length, 0);
    await login(teacher, "aal2");
    await assert.rejects(db.query("select moderate_student_review($1,'approved',$2)", [review.id,withdrawn.updated_at]), /REVIEW_CONFLICT/);
    await db.exec("reset role");
    assert.equal((await one("select * from student_reviews")).quote, review.quote);
    await db.exec("set role service_role");
    assert.equal((await db.query("select * from claim_review_emails()")).rows.length, 0);
    await db.exec("reset role");
    const more = [];
    for (let i=0;i<12;i++) {
      const pupil = (await one("insert into auth.users(email) values($1) returning id", [`student${i}@example.test`])).id;
      more.push(pupil);
      for (let j=0;j<5;j++) {
        await db.query(`insert into bookings(student_id,starts_at,ends_at)
          values($1,now()-interval '400 days'+($2*interval '2 hours'),now()-interval '400 days'+($2*interval '2 hours')+interval '1 hour')`,
          [pupil,i*5+j]);
      }
    }
    await db.query("insert into student_reviews(student_id,display_name,quote,consent_at) values($1,'Already submitted','Esta é a minha experiência real.',now())", [more[0]]);
    await db.exec("set role service_role");
    const firstBatch = (await db.query("select * from claim_review_emails()")).rows;
    assert.equal(firstBatch.length, 10);
    assert.ok(!firstBatch.some(request => request.student_id === more[0]));
    const secondBatch = (await db.query("select * from claim_review_emails()")).rows;
    assert.equal(secondBatch.length, 1);
    assert.ok(!firstBatch.some(request => request.student_id === secondBatch[0].student_id));
    assert.equal((await db.query("select * from claim_review_emails()")).rows.length, 0);
  } finally { await db.close(); }
});
