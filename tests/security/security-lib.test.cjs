const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, statSync } = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..", "..");

function load(relative) {
  const filename = path.resolve(root, relative);
  const output = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(output, filename);
  return compiled.exports;
}

const codes = load("src/lib/security/recovery-codes.ts");
const { trustedClientIp, ipRateLimitKey } = load("src/lib/security/client-ip.ts");
const ids = load("src/lib/security/identifiers.ts");
const { safeNextPath, nextFromReferer } = load("src/lib/security/redirects.ts");
const { normalizeTotpCode, totpQrDataUrl } = load("src/lib/security/totp-input.ts");
const { sessionEndedMessage } = load("src/lib/i18n/security.ts");

const headers = (values) => ({ get: (name) => values[name.toLowerCase()] ?? null });
const secret = "s".repeat(48);
const userId = "6f1c2f52-6a4b-4b52-9c1e-6f0d3c1b2a10";

test("recovery codes are distinct, well formed and carry >=128 bits", () => {
  const list = codes.generateRecoveryCodes();
  assert.equal(list.length, codes.RECOVERY_CODE_COUNT);
  assert.equal(new Set(list).size, list.length);
  for (const code of list) {
    assert.match(code, /^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}-[0-9A-HJKMNP-TV-Z]{6}$/);
    const normalized = codes.normalizeRecoveryCode(code);
    assert.equal(normalized.length * 5 >= 128, true);
  }
});

test("recovery code normalization tolerates typing variants and rejects junk", () => {
  const [code] = codes.generateRecoveryCodes(1);
  const normalized = codes.normalizeRecoveryCode(code);
  assert.equal(codes.normalizeRecoveryCode(` ${code.toLowerCase().replace(/-/g, " ")} `), normalized);
  assert.equal(codes.normalizeRecoveryCode("0".repeat(25) + "O"), "0".repeat(26));
  assert.equal(codes.normalizeRecoveryCode("1".repeat(24) + "IL"), "1".repeat(26));
  assert.equal(codes.normalizeRecoveryCode("ABC"), null);
  assert.equal(codes.normalizeRecoveryCode("U".repeat(26)), null);
  assert.equal(codes.normalizeRecoveryCode(42), null);
  assert.equal(codes.normalizeRecoveryCode("A".repeat(65)), null);
});

test("recovery code hashes are account-bound SHA-256 values", () => {
  const n = codes.normalizeRecoveryCode(codes.generateRecoveryCodes(1)[0]);
  const hash = codes.hashRecoveryCode(userId, n);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(codes.hashRecoveryCode(userId, n), hash);
  assert.notEqual(codes.hashRecoveryCode("00000000-0000-0000-0000-000000000000", n), hash);
});

test("client IP only comes from the configured trusted header", () => {
  const h = headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8", "cf-connecting-ip": "9.9.9.9" });
  assert.equal(trustedClientIp(h, {}), null);
  assert.equal(trustedClientIp(h, { VERCEL: "1" }), "5.6.7.8");
  assert.equal(trustedClientIp(h, { TRUSTED_CLIENT_IP_HEADER: "CF-Connecting-IP" }), "9.9.9.9");
  assert.equal(trustedClientIp(h, { TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for" }), null);
  assert.equal(trustedClientIp(headers({ "x-real-ip": "1.1.1.1, 2.2.2.2" }), { VERCEL: "1" }), null);
  assert.equal(trustedClientIp(headers({ "x-real-ip": "not-an-ip" }), { VERCEL: "1" }), null);
  assert.equal(trustedClientIp(headers({ "x-real-ip": "[2001:DB8::1]" }), { VERCEL: "1" }), "2001:db8::1");
});

test("IP rate-limit keys group IPv6 per /64", () => {
  assert.equal(ipRateLimitKey("203.0.113.9"), "203.0.113.9");
  assert.equal(ipRateLimitKey("2001:db8:0:1:aaaa::1"), "2001:db8:0:1::/64");
  assert.equal(ipRateLimitKey("2001:0db8:0000:0001:ffff:ffff:ffff:ffff"), "2001:db8:0:1::/64");
  assert.equal(ipRateLimitKey("::ffff:198.51.100.7"), "198.51.100.7");
  assert.equal(ipRateLimitKey("::1"), "0:0:0:0::/64");
  assert.equal(ipRateLimitKey("nope"), null);
});

test("identifiers are normalized and keyed (no raw value, secret required)", () => {
  assert.equal(ids.normalizeEmail("  Ana@Example.COM "), "ana@example.com");
  const a = ids.rateLimitKeyHash(secret, "login:email", "ana@example.com");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(ids.rateLimitKeyHash(secret, "reset:email", "ana@example.com"), a);
  assert.notEqual(ids.rateLimitKeyHash("t".repeat(48), "login:email", "ana@example.com"), a);
  assert.match(ids.auditIdentifierHash(secret, "ana@example.com"), /^[0-9a-f]{32}$/);
  assert.throws(() => ids.rateLimitKeyHash("short", "login:email", "x"));
});

test("post-verification redirects stay on allowed same-origin paths", () => {
  assert.equal(safeNextPath("password"), "/auth/set-password");
  assert.equal(safeNextPath("/dashboard?tab=1"), "/dashboard?tab=1");
  assert.equal(safeNextPath("/admin/students/1"), "/admin/students/1");
  assert.equal(safeNextPath("/security/setup?replace=1"), "/security/setup?replace=1");
  assert.equal(safeNextPath("/security/settings"), "/security/settings");
  for (const bad of ["//evil.example", "https://evil.example/admin", "/\\evil", "/login", "/security/recover", "/admin\n", "", null, "/administrator"]) {
    assert.equal(safeNextPath(bad), null, String(bad));
  }
  assert.equal(nextFromReferer("https://site.example/admin/settings", "site.example"), "/admin/settings");
  assert.equal(nextFromReferer("https://evil.example/admin", "site.example"), null);
  assert.equal(nextFromReferer(null, "site.example"), null);
});

test("TOTP input and QR data are sanitized", () => {
  assert.equal(normalizeTotpCode("123 456"), "123456");
  assert.equal(normalizeTotpCode("12345"), null);
  assert.equal(normalizeTotpCode("abcdef"), null);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  assert.match(totpQrDataUrl(svg), /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  assert.match(totpQrDataUrl(`data:image/svg+xml;utf-8,${svg}`), /^data:image\/svg\+xml;charset=utf-8,/);
  assert.equal(totpQrDataUrl('<svg onload="alert(1)"></svg>'), null);
  assert.equal(totpQrDataUrl("<svg><script>x</script></svg>"), null);
  assert.equal(totpQrDataUrl("<html></html>"), null);
});

test("login reason messages only exist for known reasons", () => {
  for (const reason of ["idle_timeout", "absolute_timeout", "revoked", "signed_out", "account_inactive", "account_missing", "signed_out_everywhere", "mfa_reset"]) {
    assert.equal(typeof sessionEndedMessage(reason), "string");
  }
  assert.equal(sessionEndedMessage("toString"), null);
  assert.equal(sessionEndedMessage("<script>"), null);
  assert.equal(sessionEndedMessage(undefined), null);
});

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

test("security code never uses Supabase native recovery or logs secrets", () => {
  const files = [
    ...sourceFiles(path.join(root, "src", "app", "security")),
    ...sourceFiles(path.join(root, "src", "components", "security")),
    ...sourceFiles(path.join(root, "src", "lib", "security")),
    path.join(root, "src", "lib", "auth.ts"),
    path.join(root, "src", "app", "actions", "auth.ts"),
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /auth\.mfa\.\w*[Rr]ecovery|factorType:\s*["']recovery/, file);
    for (const line of source.split("\n").filter((l) => /console\.(log|error|warn|info)/.test(l))) {
      assert.doesNotMatch(line, /[,(]\s*(?!\w*error\??\.)(\w+\.)?(password|code|codes|totp|secret|hashes|token|email|ip|headers)\s*[,)]/i, `${file}: ${line.trim()}`);
    }
  }
});

test("server actions and pages enforce the documented guards", () => {
  const actions = readFileSync(path.join(root, "src", "app", "security", "actions.ts"), "utf8");
  const recover = actions.slice(actions.indexOf("export async function recoverWithCode"));
  const order = ["limitRecovery", "verifyCurrentPassword", "security_consume_recovery_code", "deleteFactor", "security_finish_mfa_recovery", "endLocalSession", "signInWithPassword", 'redirect("/security/setup")'];
  let last = -1;
  for (const step of order) {
    const index = recover.indexOf(step, last + 1);
    assert.ok(index > last, `recovery step out of order: ${step}`);
    last = index;
  }
  assert.doesNotMatch(recover.slice(0, recover.indexOf("export async function", 10)), /challengeAndVerify|mfa\.verify\(/);
  assert.match(actions, /regenerateRecoveryCodes[\s\S]*?requireRecentAuthentication/);

  const signIn = readFileSync(path.join(root, "src", "app", "actions", "auth.ts"), "utf8");
  assert.doesNotMatch(signIn, /from\(["']profiles["']\)/);
  assert.ok(signIn.indexOf("verifyTurnstile") < signIn.indexOf("limitLogin("));
  assert.match(signIn, /redirect\("\/security"\)/);

  const auth = readFileSync(path.join(root, "src", "lib", "auth.ts"), "utf8");
  for (const name of ["requireAuthenticatedUser", "requireMfa", "requireRecentAuthentication", "hasRecentAuthentication"]) {
    assert.match(auth, new RegExp(`export async function ${name}\\(`));
  }
  assert.match(auth, /status\.aal !== "aal2"\) redirect\("\/security\/verify"\)/);
});