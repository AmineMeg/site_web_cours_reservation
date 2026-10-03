import { createHmac, timingSafeEqual } from "node:crypto";

interface PasswordFlow {
  userId: string;
  sessionId: string;
  expiresAt: number;
}

export function signPasswordFlow(proof: PasswordFlow, secret: string): string {
  const body = Buffer.from(JSON.stringify(proof)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function verifyPasswordFlow(
  value: string,
  secret: string,
  userId: string,
  sessionId: string,
  now = Date.now(),
): boolean {
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  const received = Buffer.from(signature, "base64url");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  let proof: PasswordFlow;
  try {
    proof = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  return proof?.userId === userId && proof?.sessionId === sessionId
    && Number.isFinite(proof.expiresAt) && proof.expiresAt > now
    && proof.expiresAt <= now + 10 * 60 * 1000;
}
