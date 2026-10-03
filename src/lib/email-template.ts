import { emailText as e } from "./i18n/email";

export interface EmailPresentation {
  title: string;
  preview: string;
  paragraphs?: string[];
  details?: { label: string; value: string }[];
  note?: string;
  action?: { label: string; url: string };
}

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

function safeEmailUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("Unsafe email action URL");
  }
  return escapeEmailHtml(url.href);
}

/** Inline styles and tables work in email clients without JavaScript or remote CSS. */
export function renderEmailHtml(text: string, presentation: EmailPresentation): string {
  const escape = escapeEmailHtml;
  const actionUrl = presentation.action ? safeEmailUrl(presentation.action.url) : null;
  const paragraphs = (presentation.paragraphs ?? text.split(/\n{2,}/)).map((paragraph) => {
    const lines = paragraph.split("\n").filter((line) => line !== presentation.action?.url);
    return lines.length ? `<p style="margin:0 0 20px;line-height:1.7;white-space:normal;overflow-wrap:anywhere;">${escape(lines.join("\n")).replace(/\n/g, "<br>")}</p>` : "";
  }).join("");
  const details = presentation.details?.length ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
      ${presentation.details.map((item) => `<tr><td style="padding:16px 20px;border-bottom:1px solid #dcfce7;">
        <p style="margin:0 0 6px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#166534;">${escape(item.label)}</p>
        <p style="margin:0;font-size:19px;font-weight:bold;line-height:1.5;color:#14532d;overflow-wrap:anywhere;">${escape(item.value)}</p>
      </td></tr>`).join("")}
    </table>` : "";
  const note = presentation.note ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;background:#fffbeb;border-left:4px solid #d97706;">
    <tr><td style="padding:16px;font-size:15px;line-height:1.7;color:#78350f;">${escape(presentation.note).replace(/\n/g, "<br>")}</td></tr>
  </table>` : "";
  const action = presentation.action && actionUrl ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;width:100%;"><tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#166534" align="center" style="border-radius:8px;mso-padding-alt:16px 24px;">
        <a href="${actionUrl}" style="display:inline-block;border:1px solid #166534;background:#166534;color:#ffffff;text-decoration:none;padding:16px 24px;border-radius:8px;font-size:18px;font-weight:bold;">${escape(presentation.action.label)}</a>
      </td></tr></table>
    </td></tr></table>
    <p style="font-size:13px;line-height:1.6;color:#57534e;overflow-wrap:anywhere;">${escape(e.buttonFallback)}<br><a href="${actionUrl}" style="color:#166534;">${escape(presentation.action.url)}</a></p>` : "";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(presentation.title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4;color:#292524;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escape(presentation.preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f5f5f4" style="background:#f5f5f4;"><tr><td align="center" style="padding:24px 12px;">
    <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;">
      <tr><td bgcolor="#166534" style="padding:28px;background:#166534;color:#ffffff;border-radius:12px 12px 0 0;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#dcfce7;">${escape(e.brandCategory)}</p>
        <p style="margin:0;font-size:23px;font-weight:bold;color:#ffffff;">${escape(e.brand)}</p>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.6;">${escape(e.tagline)}</p>
      </td></tr>
      <tr><td style="padding:28px;font-size:16px;">
        <h1 style="margin:0 0 24px;font-size:26px;line-height:1.3;color:#14532d;">${escape(presentation.title)}</h1>
        ${paragraphs}${details}${note}${action}
      </td></tr>
      <tr><td style="padding:20px 28px;border-top:1px solid #e7e5e4;color:#57534e;font-size:13px;line-height:1.6;">
        ${escape(e.automatic)}<br>${escape(e.footer)}
      </td></tr>
    </table>
    <!--[if mso]></td></tr></table><![endif]-->
  </td></tr></table>
</body></html>`;
}
