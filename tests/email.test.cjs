const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { load } = require("./load-typescript.cjs");
const { renderEmailHtml } = load("src/lib/email-template.ts");
const { emailText } = load("src/lib/i18n/email.ts");
const { pt } = load("src/lib/i18n/pt.ts");
const root = path.resolve(__dirname, "..");

function mocked(relative, mocks) {
  const filename = path.join(root, relative);
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled.require = (name) => {
    if (name === "server-only") return {};
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) return load(`src/${name.slice(2)}.ts`);
    return require(name);
  };
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return compiled.exports;
}

test("Portuguese HTML email escapes content, adds preheader/button and keeps token URL intact", () => {
  const url = "https://example.com/auth/confirm?token_hash=" + "a".repeat(56) + "&type=invite";
  const text = `Olá, <img src=x onerror=alert(1)>!\n\nAtive sua conta:\n${url}\n\nNunca compartilhe sua senha.`;
  const html = renderEmailHtml(text, {
    title: 'Boas-vindas <script>"test"</script>', preview: "Escolha sua senha",
    action: { label: emailText.activate, url },
  });
  assert.match(html, /lang="pt-BR"/);
  assert.match(html, /max-width:600px/);
  assert.match(html, /Escolha sua senha/);
  assert.match(html, /Ativar minha conta/);
  assert.ok(html.includes(url.replace("&", "&amp;")));
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&lt;img"));
  for (const unsafe of ["javascript:alert(1)", "http://example.com", "https://user:pass@example.com", "not a URL"]) {
    assert.throws(() => renderEmailHtml("Olá!", { title: "Conta", preview: "", action: { label: "Entrar", url: unsafe } }));
  }
});

test("every notification and security alert includes Portuguese presentation and correct reply recipient", async () => {
  const messages = [];
  const config = { siteConfig: { siteUrl: "https://example.com", teacherEmail: "teacher@example.com" } };
  const sendEmail = async (payload) => { messages.push(payload); return { ok: true }; };
  const notifications = mocked("src/lib/notifications.ts", {
    "@/lib/email": { sendEmail }, "@/lib/config": config, "@/lib/i18n": { t: pt },
  });
  const user = { name: "Ana", email: "ana@example.com", url: "https://example.com/auth/confirm?token_hash=abc&type=invite",
    when: "5 de outubro às 09:00", phone: "123", message: "<script>Não interprete como HTML</script>" };
  await notifications.notifyTeacherNewContact(user);
  await notifications.sendStudentInvitation(user);
  await notifications.sendPasswordReset({ ...user, name: "" });
  await notifications.sendCancellationNotice(user);
  assert.deepEqual(await notifications.sendBookingEmails(user), { ok: true });
  await notifications.sendStudentMessageToTeacher(user);
  const alerts = mocked("src/lib/security/alerts.ts", { "@/lib/email": { sendEmail } });
  await alerts.sendSecurityAlert(user.email, "mfa_enrolled");
  assert.equal(messages.length, 8);
  for (const message of messages) {
    assert.ok(message.presentation.title);
    assert.ok(message.presentation.preview);
    assert.match(renderEmailHtml(message.text, message.presentation), /Espanhol com Eliane Teixeira/);
    assert.doesNotMatch(message.subject, /Your |New |Lesson |Security alert/);
  }
  assert.equal(messages[1].presentation.action.url, user.url);
  assert.equal(messages[1].replyTo, config.siteConfig.teacherEmail);
  assert.ok(messages[2].text.startsWith("Olá!\n"));
  assert.equal(messages[5].replyTo, user.email);
  assert.equal(messages[6].replyTo, user.email);
  assert.deepEqual(messages[4].presentation.details[0], { label: emailText.lessonTime, value: user.when });
  assert.equal(messages[4].presentation.details[1].value, emailText.creditUsed);
  await notifications.sendCancellationNotice({ ...user, refundedCredits: 0 });
  assert.doesNotMatch(messages[8].subject, /crédito devolvido/);
  assert.doesNotMatch(messages[8].text, /Seu crédito foi devolvido/);
  await notifications.sendBookingEmails({ ...user, creditsUsed: 0 });
  assert.match(messages[9].text, /Nenhum crédito foi descontado/);
  assert.match(messages[10].text, /Nenhum crédito foi descontado/);
  assert.equal(messages[9].presentation.details[1].value, emailText.gifted);
  const cancellationHtml = renderEmailHtml(messages[8].text, messages[8].presentation);
  assert.ok(cancellationHtml.includes("&lt;script&gt;"));
  assert.ok(!cancellationHtml.includes("<script>"));
  assert.ok(cancellationHtml.includes("bgcolor="));
});

test("new contact notification shows country and timezone without collecting or displaying city", async () => {
  const messages = [];
  const notifications = mocked("src/lib/notifications.ts", {
    "@/lib/email": { sendEmail: async (payload) => { messages.push(payload); return { ok: true }; } },
    "@/lib/config": { siteConfig: { siteUrl: "https://example.com", teacherEmail: "teacher@example.com" } },
    "@/lib/i18n": { t: pt },
  });
  await notifications.notifyTeacherNewContact({ name: "Ana", email: "ana@example.com", phone: "", message: "",
    country: "Brasil", timezone: "America/Sao_Paulo", city: "Historical city" });
  assert.match(messages[0].text, /Brasil\nFuso horário: America\/Sao_Paulo/);
  assert.doesNotMatch(messages[0].text, /Historical city|undefined|Cidade/);
});

test("trial emails omit the 24-hour notice while regular confirmations retain it", async () => {
  const messages = [];
  const notifications = mocked("src/lib/notifications.ts", {
    "@/lib/email": { sendEmail: async (payload) => { messages.push(payload); return { ok: true }; } },
    "@/lib/config": { siteConfig: { siteUrl: "https://example.com", teacherEmail: "teacher@example.com" } },
    "@/lib/i18n": { t: pt },
  });
  const user = { name: "Ana", email: "ana@example.com", token: "a".repeat(64),
    when: "4 de outubro às 20:30 (America/New York, UTC-04:00)",
    teacherWhen: "4 de outubro às 21:30 (America/Sao Paulo, UTC-03:00)" };
  await notifications.sendTrialInvitation(user);
  await notifications.sendTrialBookingEmails(user);
  await notifications.sendTrialBookingEmails({ ...user, cancelled: true });
  for (const message of messages) {
    assert.doesNotMatch(message.text, /24 horas/);
    assert.doesNotMatch(renderEmailHtml(message.text, message.presentation), /24 horas/);
    assert.match(message.text, /30 minutos/);
  }
  assert.match(messages[0].presentation.action.url, /\/trial\/a{64}$/);
  assert.match(messages[1].text, /20:30.*America\/New York/);
  assert.match(messages[2].text, /21:30.*America\/Sao Paulo/);
  await notifications.sendBookingEmails(user);
  assert.match(messages[5].text, /24 horas/);
  assert.match(renderEmailHtml(messages[5].text, messages[5].presentation), /24 horas/);
});

test("Resend and webhook receive HTML plus unchanged plain text; failures do not log content", async () => {
  const saved = { key: process.env.RESEND_API_KEY, webhook: process.env.EMAIL_WEBHOOK_URL };
  const oldFetch = global.fetch;
  const oldError = console.error;
  const logs = [];
  const calls = [];
  const payload = { to: "ana@example.com", subject: "Sua aula está confirmada", text: "Olá, Ana!\n\nSua aula está confirmada.",
    presentation: { title: "Sua aula está confirmada!", preview: "Confira seu horário." }, replyTo: "teacher@example.com" };
  const { sendEmail } = mocked("src/lib/email.ts", {});
  try {
    console.error = (...args) => logs.push(args);
    global.fetch = async (url, options) => { calls.push({ url, headers: options.headers, body: JSON.parse(options.body) }); return new Response("", { status: 200 }); };
    process.env.RESEND_API_KEY = "test-key";
    delete process.env.EMAIL_WEBHOOK_URL;
    assert.deepEqual(await sendEmail(payload), { ok: true });
    assert.equal(calls[0].body.text, payload.text);
    assert.match(calls[0].body.html, /lang="pt-BR"/);
    assert.equal(calls[0].body.reply_to, payload.replyTo);
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_WEBHOOK_URL = "https://example.com/mail-hook";
    assert.deepEqual(await sendEmail(payload), { ok: true });
    assert.equal(calls[1].body.text, payload.text);
    assert.equal(calls[1].body.html, calls[0].body.html);
    assert.equal(calls[1].body.replyTo, payload.replyTo);
    assert.equal(calls[1].body.presentation, undefined);
    process.env.RESEND_API_KEY = "test-key";
    await sendEmail({ ...payload, idempotencyKey: "review-invitation-test" });
    assert.equal(calls[2].headers["Idempotency-Key"], "review-invitation-test");
    assert.equal(calls[2].body.idempotencyKey, undefined);
    delete process.env.RESEND_API_KEY;
    await sendEmail({ ...payload, idempotencyKey: "review-invitation-test" });
    assert.equal(calls[3].headers["Idempotency-Key"], "review-invitation-test");
    assert.equal(calls[3].body.idempotencyKey, undefined);
    global.fetch = async () => new Response("private provider response", { status: 500 });
    assert.deepEqual(await sendEmail(payload), { ok: false });
    delete process.env.EMAIL_WEBHOOK_URL;
    assert.deepEqual(await sendEmail(payload), { ok: false });
    assert.ok(!JSON.stringify(logs).includes("private provider response"));
    assert.ok(!JSON.stringify(logs).includes(payload.text));
  } finally {
    global.fetch = oldFetch;
    console.error = oldError;
    if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key;
    if (saved.webhook === undefined) delete process.env.EMAIL_WEBHOOK_URL; else process.env.EMAIL_WEBHOOK_URL = saved.webhook;
  }
});
