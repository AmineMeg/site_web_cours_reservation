const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load-typescript.cjs");

const { passwordProblem } = load("src/lib/password-policy.ts");
const { signPasswordFlow, verifyPasswordFlow } = load("src/lib/auth-flow-proof.ts");
const { validAccountToken } = load("src/lib/account-token.ts");
const secret = "a".repeat(64);
const now = 1_800_000_000_000;
const proof = { userId: "user-a", sessionId: "session-a", expiresAt: now + 600_000 };

test("Supabase SHA-224 invitation hashes and SHA-256 hashes pass without accepting arbitrary tokens", () => {
  for (const size of [56, 64]) assert.equal(validAccountToken("a".repeat(size)), true);
  for (const token of [null, "", "a".repeat(55), "a".repeat(57), "g".repeat(56), "https://example.com"]) {
    assert.equal(validAccountToken(token), false);
  }
});

test("password policy accepts phrases without imposing character classes", () => {
  assert.equal(passwordProblem("a memorable long phrase", "a memorable long phrase"), null);
  assert.equal(passwordProblem("a".repeat(15), "a".repeat(15)), null);
});

test("password policy enforces exact boundaries and confirmation", () => {
  assert.equal(passwordProblem("a".repeat(14), "a".repeat(14)), "short");
  assert.equal(passwordProblem("a".repeat(72), "a".repeat(72)), null);
  assert.equal(passwordProblem("a".repeat(73), "a".repeat(73)), "long");
  assert.equal(passwordProblem("\u00e9".repeat(37), "\u00e9".repeat(37)), "long");
  assert.equal(passwordProblem("a".repeat(15), "b".repeat(15)), "mismatch");
});

test("password setup proof is bound to user, session and signing secret", () => {
  const signed = signPasswordFlow(proof, secret);
  assert.equal(verifyPasswordFlow(signed, secret, "user-a", "session-a", now), true);
  assert.equal(verifyPasswordFlow(signed, secret, "user-b", "session-a", now), false);
  assert.equal(verifyPasswordFlow(signed, secret, "user-a", "session-b", now), false);
  assert.equal(verifyPasswordFlow(signed, "wrong-secret", "user-a", "session-a", now), false);
});

test("expired, forged and malformed password proofs are rejected", () => {
  const signed = signPasswordFlow(proof, secret);
  assert.equal(verifyPasswordFlow(signed, secret, "user-a", "session-a", now + 600_000), false);
  assert.equal(verifyPasswordFlow(signed + ".extra", secret, "user-a", "session-a", now), false);
  assert.equal(verifyPasswordFlow("broken", secret, "user-a", "session-a", now), false);
  assert.equal(verifyPasswordFlow(signPasswordFlow({ ...proof, expiresAt: now + 600_001 }, secret), secret, "user-a", "session-a", now), false);
  const [body, signature] = signed.split(".");
  assert.equal(verifyPasswordFlow(`${body}.${signature.slice(1)}`, secret, "user-a", "session-a", now), false);
});

test("account email templates never interpolate a password", () => {
  const { pt } = load("src/lib/i18n/pt.ts");
  const data = { name: "Student", email: "student@example.com", url: "https://example.com/auth/confirm?token_hash=example" };
  for (const template of [pt.emails.credentials, pt.emails.passwordReset]) {
    assert.ok(template.body(data).includes(data.url));
    assert.ok(!template.body(data).includes("Password:"));
    assert.ok(!template.body(data).includes("Senha:"));
  }
});
