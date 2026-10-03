import { isIP } from "node:net";

interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Client IP from ONE header set by the trusted deployment edge (never a
 * spoofable X-Forwarded-For chain). Configure TRUSTED_CLIENT_IP_HEADER
 * (e.g. "cf-connecting-ip" behind Cloudflare); on Vercel "x-real-ip" is used.
 * Returns null when no trustworthy value exists (IP limits are then skipped).
 * The value is only used to derive an HMAC'd rate-limit key and is never logged.
 */
export function trustedClientIp(headers: HeaderReader, env: Record<string, string | undefined> = process.env): string | null {
  const configured = env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  const header = configured || (env.VERCEL === "1" ? "x-real-ip" : "");
  if (!header || !/^[a-z0-9-]{1,64}$/.test(header) || header === "x-forwarded-for") return null;
  const value = headers.get(header)?.trim();
  if (!value || value.length > 64 || value.includes(",")) return null;
  const ip = value.replace(/^\[(.*)\]$/, "$1");
  return isIP(ip) ? ip.toLowerCase() : null;
}

/** IPv4 address as is; IPv6 grouped per /64 (one customer network). */
export function ipRateLimitKey(ip: string): string | null {
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6) return null;
  const lower = ip.toLowerCase().split("%")[0];
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return mapped[1];
  const [head, tail = ""] = lower.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = lower.includes("::") && tail ? tail.split(":") : [];
  if (tailParts.some((part) => part.includes(".")) || headParts.some((part) => part.includes("."))) {
    return lower; // Rare embedded-IPv4 forms: use the full address.
  }
  const missing = 8 - headParts.length - tailParts.length;
  const groups = lower.includes("::") ? [...headParts, ...Array(missing).fill("0"), ...tailParts] : headParts;
  if (groups.length !== 8) return null;
  return `${groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}