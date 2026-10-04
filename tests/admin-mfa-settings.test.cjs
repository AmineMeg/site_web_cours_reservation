const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { createLoader } = require("./load-typescript.cjs");
const { loadPglite, prepare, PLATFORM } = require("./security/pg-harness.cjs");
const PGlite = loadPglite();
const root = path.resolve(__dirname, "..");
const sql = (file) => fs.readFileSync(path.join(root, "supabase", file), "utf8");

test("admin MFA action confirms role, recent auth and password before service mutation of only its caller", async () => {
  const calls = [], alerts = [];
  let passwordOk = true, allowed = true, enabled = true, hasFactor = false, dbError = null, teacher = true;
  const user = { id: "admin-id", email: "admin@example.test" };
  const load = createLoader({
    "server-only": {},
    "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    "next/cache": { revalidatePath: (url) => calls.push(["refresh", url]) },
    "@/lib/auth": {
      requireTeacher: async () => { calls.push(["teacher"]); if (!teacher) throw new Error("NOT_TEACHER"); return { profile: { id: user.id } }; },
      requireRecentAuthentication: async () => { calls.push(["recent"]); return { user, status: { requiresMfa: enabled, hasVerifiedFactor: hasFactor } }; },
    },
    "@/lib/security/rate-limit": { limitSensitivePasswordCheck: async (id) => { calls.push(["limit", id]); return allowed; } },
    "@/lib/verify-password": { verifyCurrentPassword: async (...args) => { calls.push(["password", ...args]); return passwordOk; } },
    "@/lib/security/alerts": { sendSecurityAlert: async (...args) => alerts.push(args) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (...args) => { calls.push(["rpc", ...args]); return { error: dbError }; } }) },
  });
  const { setMyAdminMfa } = load("src/app/security/actions.ts");
  const form = (value = "false") => { const data = new FormData(); data.set("enabled", value);
    data.set("current_password", "test-password"); data.set("user_id", "someone-else"); return data; };
  teacher = false;
  await assert.rejects(setMyAdminMfa(null, form()), /NOT_TEACHER/);
  assert.equal(calls.length, 1);
  teacher = true; calls.length = 0;
  assert.equal((await setMyAdminMfa(null, form("invalid"))).ok, false);
  assert.equal(calls.some(([type]) => type === "rpc"), false);
  allowed = false;
  assert.equal((await setMyAdminMfa(null, form())).ok, false);
  allowed = true; passwordOk = false;
  assert.equal((await setMyAdminMfa(null, form())).ok, false);
  assert.equal(calls.some(([type]) => type === "rpc"), false);
  passwordOk = true; calls.length = 0;
  assert.equal((await setMyAdminMfa(null, form())).ok, true);
  assert.deepEqual(calls.slice(0, 4).map(([type]) => type), ["teacher", "recent", "limit", "password"]);
  assert.deepEqual(calls.find(([type]) => type === "rpc"), ["rpc", "set_admin_mfa", {
    p_user_id: user.id, p_enabled: false, p_expected: true,
  }]);
  assert.deepEqual(alerts[0], [user.email, "mfa_disabled"]);
  enabled = false;
  await assert.rejects(setMyAdminMfa(null, form("true")), /REDIRECT:\/security\/setup/);
  hasFactor = true;
  await assert.rejects(setMyAdminMfa(null, form("true")), /REDIRECT:\/security\/verify/);
  const original = console.error;
  console.error = () => {};
  try { dbError = { code: "P0001" }; assert.equal((await setMyAdminMfa(null, form())).ok, false); }
  finally { console.error = original; }
});

test("admin MFA control clearly explains per-account risk and asks for the current password", () => {
  const load = createLoader({ "@/app/security/actions": { setMyAdminMfa() {} } });
  const { AdminMfaSetting } = load("src/components/security/AdminMfaSetting.tsx");
  for (const enabled of [true, false]) {
    const html = renderToStaticMarkup(React.createElement(AdminMfaSetting, { enabled }));
    assert.match(html, /apenas para sua conta administrativa/);
    assert.match(html, /type="password"[^>]+name="current_password"/);
    assert.match(html, /autoComplete="current-password"|autocomplete="current-password"/);
    assert.match(html, enabled ? /Desativar segunda etapa/ : /Ativar segunda etapa/);
    if (!enabled) assert.match(html, /role="alert"/);
    assert.doesNotMatch(html, /name="user_id"/);
  }
});

test("security settings expose the MFA option only to admins and use the correct password-only explanation", async () => {
  let role = "teacher";
  const load = createLoader({
    "next/navigation": { redirect: () => { throw new Error("Unexpected redirect"); } },
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/lib/auth": {
      requireMfa: async () => ({ user: { id: "user" }, status: { requiresMfa: false },
        supabase: { rpc: async () => ({ data: 0 }),
          from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }) } }),
      getCurrentProfile: async () => ({ profile: { role } }),
      getSettings: async () => ({ timezone: "America/Sao_Paulo" }),
    },
    "@/components/security/AdminMfaSetting": { AdminMfaSetting: ({ enabled }) => React.createElement("div", { "data-admin-mfa": String(enabled) }) },
    "@/components/security/SessionControls": { SessionControls: () => null },
    "@/components/security/RegenerateCodes": { RegenerateCodes: () => null },
    "@/components/SecurityPasswordForm": { SecurityPasswordForm: () => null },
  });
  const SettingsPage = load("src/app/security/settings/page.tsx").default;
  let html = renderToStaticMarkup(await SettingsPage());
  assert.match(html, /data-admin-mfa="false"/);
  assert.match(html, /conta administrativa está usando apenas a senha/);
  assert.doesNotMatch(html, /Alunos não precisam/);
  role = "student";
  html = renderToStaticMarkup(await SettingsPage());
  assert.doesNotMatch(html, /data-admin-mfa/);
  assert.match(html, /Alunos não precisam/);
});

test("per-admin MFA policy defaults closed, protects all other users and is re-enabled immediately", {
  skip: PGlite ? false : "Set PGLITE_PATH for SQL tests",
}, async () => {
  const db = new PGlite();
  const one = async (query, params = []) => (await db.query(query, params)).rows[0];
  try {
    await db.exec(PLATFORM);
    await db.exec(prepare(sql("schema.sql")));
    await db.exec(sql("student-password-login.sql"));
    await db.exec(sql("admin-mfa-settings.sql"));
    await db.exec(sql("admin-mfa-settings.sql"));
    const original = (await one("insert into auth.users(email) values('teacher@test.com') returning id")).id;
    const miguel = (await one("insert into auth.users(email) values('miguelares1@hotmail.com') returning id")).id;
    const student = (await one("insert into auth.users(email) values('student@test.com') returning id")).id;
    await db.query("update profiles set role='teacher' where id=$1", [original]);
    await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')", [original]);
    await db.exec(sql("add-miguel-admin.sql"));
    assert.equal((await one("select role from profiles where id=$1", [miguel])).role, "teacher");
    const login = async (id, aal = "aal1") => {
      await db.exec("reset role");
      const session = (await one("insert into auth.sessions(user_id) values($1) returning id", [id])).id;
      const now = Math.floor(Date.now() / 1000);
      const amr = [{ method: "password", timestamp: now }];
      if (aal === "aal2") amr.push({ method: "totp", timestamp: now });
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({
        sub: id, role: "authenticated", aal, session_id: session, amr,
      })]);
      await db.exec("set role authenticated");
      await db.query("select * from security_session_status()");
      return session;
    };
    await login(original);
    assert.equal((await one("select security_requires_mfa() m,security_gate() g")).m, true);
    assert.equal((await one("select security_gate() g")).g, false);
    await login(original, "aal2");
    assert.equal((await one("select is_teacher() t")).t, true);
    const sid = await login(miguel);
    assert.deepEqual(await one("select security_requires_mfa() m,security_gate() g,is_teacher() t"), { m: false, g: true, t: true });
    assert.equal((await one("select security_has_recent_auth() r")).r, true);
    assert.equal((await one("select adjust_credits($1,1) n", [student])).n, 1);
    await assert.rejects(db.query("select set_admin_mfa($1,false,false)", [miguel]), /permission denied/);
    await assert.rejects(db.query("update admin_mfa_settings set enabled=false"), /permission denied/);
    await assert.rejects(db.query("insert into admin_mfa_settings values($1,false,now())", [student]), /permission denied/);
    await db.exec("reset role; set role service_role");
    await assert.rejects(db.query("select set_admin_mfa($1,false,true)", [miguel]), /MFA_SETTING_CHANGED/);
    await assert.rejects(db.query("select set_admin_mfa($1,false,true)", [student]), /NOT_ALLOWED/);
    await db.query("select set_admin_mfa($1,true,false)", [miguel]);
    await db.exec("reset role");
    assert.equal((await one("select count(*)::int n from security_audit_log where event='mfa.requirement_enabled' and subject_id=$1", [miguel])).n, 1);
    // Reusing the current AAL1 session is immediately blocked.
    await db.exec("set role authenticated");
    assert.equal((await one("select security_requires_mfa() m,security_gate() g")).g, false);
    assert.equal((await one("select security_requires_mfa() m")).m, true);
    await db.exec("reset role");
    await db.exec(sql("add-miguel-admin.sql"));
    assert.equal((await one("select enabled from admin_mfa_settings where user_id=$1", [miguel])).enabled, true);
    await db.exec("set role service_role");
    await db.query("select set_admin_mfa($1,false,true)", [miguel]);
    await db.exec("reset role");
    await db.exec(sql("admin-mfa-settings.sql"));
    assert.equal((await one("select enabled from admin_mfa_settings where user_id=$1", [miguel])).enabled, false);
    await db.exec("set role authenticated");
    assert.equal((await one("select security_gate() g")).g, true);
    await db.exec("reset role");
    await db.query("delete from auth.sessions where id=$1", [sid]);
    await db.exec("set role authenticated");
    assert.equal((await one("select security_gate() g")).g, false);
    await login(student);
    assert.deepEqual(await one("select security_requires_mfa() m,security_gate() g,is_teacher() t"), { m: false, g: true, t: false });
    await assert.rejects(db.query("select adjust_credits($1,1)", [student]), /NOT_ALLOWED/);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select set_admin_mfa($1,false,true)", [original]), /permission denied/);
    await db.exec("reset role");
    await db.query("update profiles set is_active=false where id=$1", [miguel]);
    await login(miguel);
    assert.equal((await one("select security_gate() g")).g, false);
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [miguel]);
    await assert.rejects(db.exec(sql("add-miguel-admin.sql")), /Create the account/);
    await db.exec("rollback");
  } finally { await db.close(); }
});
