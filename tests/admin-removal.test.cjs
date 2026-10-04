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

test("admin removal actions authenticate, report missing/errors and refresh affected lists", async () => {
  const calls = [];
  let roleAllowed = true, rpcData = "archived", error = null, message = { id: "message" };
  const load = createLoader({
    "server-only": {},
    "next/cache": { revalidatePath: (...args) => calls.push(["refresh", ...args]) },
    "@/lib/auth": { requireTeacher: async () => {
      calls.push(["guard"]);
      if (!roleAllowed) throw new Error("NOT_TEACHER");
      return { supabase: {
        rpc: async (...args) => { calls.push(["rpc", ...args]); return { data: rpcData, error }; },
        from: (table) => ({ delete: () => ({ eq: (key, id) => ({ select: () => ({
          maybeSingle: async () => { calls.push(["delete", table, key, id]); return { data: message, error }; },
        }) }) }) }),
      } };
    } },
  });
  const { deleteContact, restoreContact, deleteStudentMessage } = load("src/app/admin/actions.ts");
  assert.match((await deleteContact("contact")).message, /ocultado/);
  assert.deepEqual(calls.slice(0, 2), [["guard"], ["rpc", "remove_contact", { p_id: "contact" }]]);
  rpcData = "deleted";
  assert.match((await deleteContact("contact")).message, /removido/);
  assert.equal((await restoreContact("contact")).ok, true);
  assert.equal((await deleteStudentMessage("message")).ok, true);
  assert.ok(calls.some(([type, table]) => type === "delete" && table === "messages"));
  const original = console.error;
  console.error = () => {};
  try {
    rpcData = "unexpected";
    assert.equal((await deleteContact("contact")).ok, false);
    error = { code: "P0001", message: "CONTACT_NOT_FOUND" };
    assert.match((await restoreContact("gone")).message, /não está mais disponível/);
    assert.equal((await deleteContact("gone")).ok, false);
    assert.equal((await deleteStudentMessage("message")).ok, false);
    error = null; message = null;
    assert.match((await deleteStudentMessage("gone")).message, /não está mais disponível/);
  } finally { console.error = original; }
  calls.length = 0; roleAllowed = false;
  for (const action of [deleteContact, restoreContact, deleteStudentMessage]) await assert.rejects(action("id"), /NOT_TEACHER/);
  assert.ok(calls.every(([type]) => type === "guard"));
});

test("contact history offers hide/restore, while no-history contacts and messages offer deletion", () => {
  const load = createLoader({
    "@/app/admin/actions": {},
  });
  const { ContactCard } = load("src/components/admin/ContactCard.tsx");
  const { DeleteMessageButton } = load("src/components/admin/DeleteMessageButton.tsx");
  const props = { contact: { id: "contact", name: "Ana", email: "ana@example.test", phone: "", message: "",
    country: "Brasil", timezone: "America/Sao_Paulo", archived_at: null }, receivedLabel: "hoje", daysLeft: 30,
    trial: null, timezone: "America/Sao_Paulo", now: Date.now(), hasTrialHistory: false };
  let html = renderToStaticMarkup(React.createElement(ContactCard, props));
  assert.match(html, /🗑️ Remover/);
  html = renderToStaticMarkup(React.createElement(ContactCard, { ...props, hasTrialHistory: true }));
  assert.match(html, /🗑️ Ocultar contato/);
  html = renderToStaticMarkup(React.createElement(ContactCard, { ...props,
    contact: { ...props.contact, archived_at: new Date().toISOString() }, hasTrialHistory: true }));
  assert.match(html, /Mostrar novamente/);
  assert.doesNotMatch(html, /🗑️|Criar conta de aluno|Enviar novo/);
  assert.match(renderToStaticMarkup(React.createElement(DeleteMessageButton, { id: "message" })), /Excluir mensagem/);
});

test("contact list and sidebar filter hidden contacts, and archived view retains restoration access", async () => {
  const filters = [];
  const load = createLoader({
    "@/app/admin/actions": {},
    "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/lib/auth": {
      requireTeacher: async () => ({ supabase: { from: (table) => {
        const query = {
          select() { return query; },
          is(...args) { filters.push([table, "is", ...args]); return query; },
          not(...args) { filters.push([table, "not", ...args]); return query; },
          order: async () => ({ data: [], error: null }),
          then(resolve) { resolve({ data: [], error: null, count: 0 }); },
        };
        return query;
      } }, profile: { full_name: "Eliane" } }),
      getSettings: async () => ({ timezone: "America/Sao_Paulo" }),
    },
    "@/components/admin/AdminSidebar": { AdminSidebar: () => null },
    "@/app/actions/auth": { signOut() {} },
  });
  const Page = load("src/app/admin/contacts/page.tsx").default;
  let html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({}) }));
  assert.match(html, /href="\/admin\/contacts\?archived=1"/);
  assert.ok(filters.some(([table, op, column]) => table === "contacts" && op === "is" && column === "archived_at"));
  filters.length = 0;
  html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ archived: "1" }) }));
  assert.match(html, /Contatos ocultos/);
  assert.ok(filters.some(([table, op, column]) => table === "contacts" && op === "not" && column === "archived_at"));
  filters.length = 0;
  const Layout = load("src/app/admin/layout.tsx").default;
  renderToStaticMarkup(await Layout({ children: null }));
  assert.ok(filters.some(([table, op, column]) => table === "contacts" && op === "is" && column === "archived_at"));
});

test("messages page wires per-message deletion and refuses to disguise database errors as an empty inbox", async () => {
  let error = null;
  const load = createLoader({
    "@/components/admin/DeleteMessageButton": { DeleteMessageButton: ({ id }) => React.createElement("button", { "data-message-id": id }, "Excluir mensagem") },
    "@/lib/auth": {
      requireTeacher: async () => ({ supabase: { from: () => ({ select: () => ({ order: () => ({
        limit: async () => ({ data: [{ id: "message-1", body: "Olá", created_at: "2026-10-04T12:00:00Z",
          student: { full_name: "Ana", email: "ana@example.test" } }], error }),
      }) }) }) } }),
      getSettings: async () => ({ timezone: "America/Sao_Paulo" }),
    },
  });
  const Page = load("src/app/admin/messages/page.tsx").default;
  const html = renderToStaticMarkup(await Page());
  assert.match(html, /data-message-id="message-1"/);
  assert.match(html, /mailto:ana@example.test/);
  assert.match(html, /Olá/);
  const original = console.error;
  console.error = () => {};
  try { error = { code: "DB_ERROR" }; await assert.rejects(Page()); }
  finally { console.error = original; }
});

test("database removal preserves trials/links, restores hidden contacts and limits message deletion to admins", {
  skip: PGlite ? false : "Set PGLITE_PATH for SQL tests",
}, async () => {
  const db = new PGlite();
  const one = async (q, params = []) => (await db.query(q, params)).rows[0];
  try {
    await db.exec(PLATFORM);
    await db.exec(prepare(sql("schema.sql")));
    await db.exec(sql("student-password-login.sql"));
    await db.exec(sql("teacher-booking.sql"));
    await db.exec(sql("trial-and-credit-rules.sql"));
    await db.exec(sql("admin-mfa-settings.sql"));
    await db.exec(sql("admin-removal.sql"));
    await db.exec(sql("admin-removal.sql"));
    const teacher = (await one("insert into auth.users(email) values('teacher@test.com') returning id")).id;
    const student = (await one("insert into auth.users(email) values('student@test.com') returning id")).id;
    await db.query("update profiles set role='teacher' where id=$1", [teacher]);
    await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')", [teacher]);
    const contact = async (email) => (await one("insert into contacts(name,email) values('Ana',$1) returning id", [email])).id;
    const empty = await contact("empty@test.com");
    const active = await contact("active@test.com");
    const cancelled = await contact("cancelled@test.com");
    await db.query("insert into trial_links(contact_id,token_hash,expires_at) values($1,$2,now()+interval '7 days')", [active, "a".repeat(64)]);
    const trial = (await one("insert into trial_bookings(contact_id, starts_at, ends_at) values($1,now()+interval '2 days',now()+interval '2 days 30 minutes') returning *", [active]));
    await db.query("insert into trial_bookings(contact_id,starts_at,ends_at,status) values($1,now()-interval '2 days',now()-interval '2 days'+interval '30 minutes','cancelled')", [cancelled]);
    const message = (await one("insert into messages(student_id,body) values($1,'Student message') returning id", [student])).id;
    const login = async (id, aal = "aal1") => {
      await db.exec("reset role");
      const session = (await one("insert into auth.sessions(user_id) values($1) returning id", [id])).id;
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({
        sub: id, role: "authenticated", aal, session_id: session,
        amr: [{ method: aal === "aal2" ? "totp" : "password", timestamp: Math.floor(Date.now() / 1000) }],
      })]);
      await db.exec("set role authenticated");
      await db.query("select * from security_session_status()");
    };
    await login(student);
    await assert.rejects(db.query("select remove_contact($1)", [empty]), /NOT_ALLOWED/);
    await assert.rejects(db.query("select restore_contact($1)", [active]), /NOT_ALLOWED/);
    assert.equal((await db.query("delete from messages where id=$1 returning id", [message])).rows.length, 0);
    await login(teacher);
    await assert.rejects(db.query("select remove_contact($1)", [empty]), /MFA_REQUIRED/);
    await login(teacher, "aal2");
    assert.equal((await one("select remove_contact($1) result", [empty])).result, "deleted");
    await assert.rejects(db.query("select remove_contact($1)", [empty]), /CONTACT_NOT_FOUND/);
    assert.equal((await one("select remove_contact($1) result", [active])).result, "archived");
    assert.ok((await one("select archived_at from contacts where id=$1", [active])).archived_at);
    assert.deepEqual(await one("select * from trial_bookings where id=$1", [trial.id]), trial);
    await db.exec("reset role; set role service_role");
    assert.equal((await one("select trial_context($1) c", ["a".repeat(64)])).c.booking.id, trial.id);
    await login(teacher, "aal2");
    assert.equal((await one("select remove_contact($1) result", [cancelled])).result, "archived");
    await db.query("select restore_contact($1)", [active]);
    assert.equal((await one("select archived_at from contacts where id=$1", [active])).archived_at, null);
    // Seed a historical converted record as the trusted database owner.
    await db.exec("reset role");
    const converted = await contact("converted@test.com");
    await db.query("insert into trial_bookings(contact_id,starts_at,ends_at) values($1,now()-interval '2 days',now()-interval '2 days'+interval '30 minutes')", [converted]);
    await db.query("update contacts set converted_at=now(),student_id=$2 where id=$1", [converted, student]);
    await login(teacher, "aal2");
    await assert.rejects(db.query("select remove_contact($1)", [converted]), /CONTACT_NOT_FOUND/);
    assert.equal((await db.query("delete from messages where id=$1 returning id", [message])).rows.length, 1);
    assert.ok(await one("select id from profiles where id=$1", [student]));
    assert.ok(await one("select id from trial_bookings where id=$1", [trial.id]));
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select remove_contact($1)", [active]), /permission denied/);
    await assert.rejects(db.query("select restore_contact($1)", [active]), /permission denied/);
  } finally { await db.close(); }
});
