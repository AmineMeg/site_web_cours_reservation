/** Six-digit authenticator code (spaces ignored), or null. */
export function normalizeTotpCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 32) return null;
  const value = input.replace(/\s/g, "");
  return /^\d{6}$/.test(value) ? value : null;
}

/** Supabase may return the QR code as raw SVG or as an SVG data URL: always return a safe data URL. */
export function totpQrDataUrl(qrCode: string): string | null {
  const prefix = /^data:image\/svg\+xml;(?:utf-8|charset=utf-8),/i;
  const svg = prefix.test(qrCode) ? qrCode.replace(prefix, "") : qrCode;
  const decoded = (() => {
    try {
      return svg.includes("%3C") || svg.includes("%3c") ? decodeURIComponent(svg) : svg;
    } catch {
      return "";
    }
  })();
  if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(decoded) || /<script|on\w+\s*=|javascript:/i.test(decoded)) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(decoded)}`;
}