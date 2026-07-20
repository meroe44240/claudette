import nodemailer from 'nodemailer';
import { LOGO_MARK_ON_NAVY_DATA_URI } from './brand-assets.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.resend.com',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: true,
  auth: {
    user: process.env.SMTP_USER || 'resend',
    pass: process.env.SMTP_PASSWORD || '',
  },
});

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string,
): Promise<void> {
  if (process.env.NODE_ENV === 'test') return;
  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@humanup.io',
    to,
    subject,
    html,
    text,
  });
}

// ─── HumanUp branded email wrapper ────────────────────
//
// Utilise sur les emails systeme (reset password, invitations, alertes)
// pour un branding coherent : header navy + logo Up chartreuse, corps
// cream, CTA button optionnel.
//
// Le recap bi-hebdo a son propre template dedié (recap.template.ts) car
// il a une structure plus riche.

const BRAND = {
  primary: '#22177A',
  primaryHover: '#4b3fb0',
  highlight: '#E6E9AF',
  bg: '#FCFCF5',
  card: '#FFFFFF',
  border: '#eceaf2',
  text: '#1A1533',
  muted: '#6e6a85',
};

const FONT_BODY =
  "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
const FONT_DISPLAY =
  "'Archivo Black', 'Manrope', -apple-system, BlinkMacSystemFont, sans-serif";

export interface BrandedEmailOptions {
  title: string;
  /** HTML body (already escaped as needed by the caller). */
  bodyHtml: string;
  /** Optional call-to-action button. */
  cta?: { label: string; href: string };
  /** Optional signature block appended below the body. */
  signature?: string;
}

/**
 * Wraps `bodyHtml` in the HumanUp branded email chrome.
 * Returns a full HTML document ready for `sendEmail`.
 */
export function renderBrandedEmail(opts: BrandedEmailOptions): string {
  const { title, bodyHtml, cta, signature } = opts;

  const ctaHtml = cta
    ? `
    <p style="margin:24px 0 0 0;">
      <a href="${escapeAttr(cta.href)}"
         style="display:inline-block;padding:12px 24px;background:${BRAND.primary};color:#ffffff;font-family:${FONT_BODY};font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">
        ${escapeHtml(cta.label)}
      </a>
    </p>`
    : '';

  const signatureHtml = signature
    ? `<p style="margin:24px 0 0 0;color:${BRAND.muted};font-size:13px;">${signature}</p>`
    : '';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Archivo+Black&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:24px;background:${BRAND.bg};font-family:${FONT_BODY};color:${BRAND.text};font-size:14px;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="padding:22px 24px;background:${BRAND.primary};border-radius:16px 16px 0 0;color:#fff;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="width:58px;vertical-align:middle;">
            <img src="${LOGO_MARK_ON_NAVY_DATA_URI}" alt="HumanUp" width="46" height="48" style="display:block;border:0;outline:none;text-decoration:none;">
          </td>
          <td style="padding-left:12px;vertical-align:middle;">
            <div style="font-family:${FONT_DISPLAY};font-size:15px;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.highlight};line-height:1;">HUMANUP</div>
            <div style="margin-top:4px;font-family:${FONT_BODY};font-size:11px;color:#c4c1d0;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85;">Recruitment Agency</div>
          </td>
        </tr>
      </table>
    </div>

    <div style="padding:28px;background:${BRAND.card};border:1px solid ${BRAND.border};border-top:none;border-radius:0 0 16px 16px;">
      <h1 style="margin:0 0 12px 0;font-family:${FONT_DISPLAY};font-size:20px;letter-spacing:-0.01em;color:${BRAND.text};">
        ${escapeHtml(title)}
      </h1>
      <div style="color:${BRAND.text};font-size:14px;line-height:1.65;">
        ${bodyHtml}
      </div>
      ${ctaHtml}
      ${signatureHtml}
    </div>

    <p style="margin:16px 0 0 0;color:${BRAND.muted};font-size:11px;text-align:center;">
      HumanUp ATS — Email automatique, ne pas répondre.
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
