import nodemailer from 'nodemailer';

type MailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{ filename: string; content: any; contentType?: string }>;
};

let cachedTransport: any;

export function isEmailEnabled() {
  const raw = String(process.env.EMAIL_ENABLED || "").trim();
  return /^(1|true|yes|on)$/i.test(raw);
}

function getTransport() {
  if (cachedTransport) return cachedTransport;
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || '587');
  const user = String(process.env.SMTP_USER || "").trim();
  const passRaw = String(process.env.SMTP_PASS || "");
  const pass = passRaw.includes(" ") ? passRaw.replace(/\s+/g, "") : passRaw.trim();
  if (!host || !user || !pass) return null;
  cachedTransport = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return cachedTransport;
}

export async function sendMail({ to, subject, html, text, attachments }: MailInput) {
  if (!isEmailEnabled()) return { ok: false, skipped: "EMAIL_DISABLED" } as any;
  const transport = getTransport();
  if (!transport) return { ok: false, skipped: 'SMTP not configured' } as any;
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'root@carpihogar.com';
  const fromName = process.env.SMTP_FROM_NAME || 'carpihogar.com';
  const from = String(fromEmail).includes('<') ? fromEmail : `${fromName} <${fromEmail}>`;
  try {
    await transport.sendMail({ from, to, subject, html, text, attachments });
    return { ok: true };
  } catch (e) {
    console.warn('[mailer] sendMail failed', (e as any)?.message || e);
    return { ok: false } as any;
  }
}

export function basicTemplate(title: string, bodyHtml: string) {
  const brand = process.env.BRAND_NAME || 'carpihogar.com';
  const base = (process.env.NEXT_PUBLIC_URL || process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
  const logoUrl = base ? `${base}/uploads/logocarpihogar.png` : '';
  const header = logoUrl
    ? `<img src="${logoUrl}" alt="${brand}" style="display:block;max-height:40px">`
    : brand;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:Arial,Helvetica,sans-serif;background:#fff7ed;padding:24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td></td><td style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #fed7aa;border-radius:8px;overflow:hidden"><div style="background:#f97316;color:#fff;padding:12px 16px;font-weight:700">${header}</div><div style="padding:16px;color:#0f172a">${bodyHtml}</div><div style="padding:12px 16px;color:#6b7280;font-size:12px;border-top:1px solid #fed7aa">Este es un correo automatico, por favor no responda. Contacto: ${process.env.CONTACT_EMAIL || 'root@carpihogar.com'}</div></td><td></td></tr></table></body></html>`;
}


