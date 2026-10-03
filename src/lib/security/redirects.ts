const BASE = "http://local.invalid";
const ALLOWED_PATHS = [/^\/admin(\/|$)/, /^\/dashboard(\/|$)/, /^\/security\/(settings|setup)$/, /^\/auth\/set-password$/];

/**
 * Same-origin path allowed as a post-verification destination, or null.
 * "password" is the alias used by the password-change flow.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 512) return null;
  if (value === "password") return "/auth/set-password";
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE || !ALLOWED_PATHS.some((pattern) => pattern.test(url.pathname))) return null;
  return url.pathname + url.search;
}

/** Path of a same-origin Referer header, when it is an allowed destination. */
export function nextFromReferer(referer: string | null, host: string | null): string | null {
  if (!referer || !host) return null;
  try {
    const url = new URL(referer);
    if (url.host !== host) return null;
    return safeNextPath(url.pathname + url.search);
  } catch {
    return null;
  }
}