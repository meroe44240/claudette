// Emails de l'espace candidat : minimalistes (fond blanc, petit logo, texte, un
// bouton indigo, signature en texte). Envoyés depuis le Gmail du recruteur quand
// il est connecté, sinon par le mailer de l'ATS.
import { sendEmail } from '../../lib/mailer.js';
import { sendRawEmail } from '../integrations/gmail.service.js';

const LOGO = 'https://humanup.io/careers/logo.png';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);

export interface MinimalEmail {
  paragraphs: string[]; // HTML déjà échappé par l'appelant
  cta?: { label: string; href: string };
  note?: string;        // HTML déjà échappé
  signature: string;    // texte brut, ex. « Méroë and Léa »
}

export function renderMinimalEmail(e: MinimalEmail): string {
  const paras = e.paragraphs.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('');
  const cta = e.cta
    ? `<a href="${esc(e.cta.href)}" style="display:inline-block;background:#22177A;color:#ffffff;font-weight:bold;font-size:14px;text-decoration:none;padding:11px 18px;border-radius:6px;margin-top:6px">${esc(e.cta.label)}</a>`
    : '';
  const note = e.note ? `<p style="margin:16px 0 0;font-size:13px;color:#6B7280">${e.note}</p>` : '';
  return `<div style="background:#ffffff;padding:8px 0">
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;max-width:520px;margin:0 auto;font-family:Arial,Helvetica,sans-serif">
<tr><td style="padding:28px 28px 0"><img src="${LOGO}" width="28" height="28" alt="Humanup" style="width:28px;height:28px;border-radius:50%;display:block"></td></tr>
<tr><td style="padding:24px 28px 4px;font-size:15px;line-height:1.6;color:#111827">${paras}${cta}${note}</td></tr>
<tr><td style="padding:20px 28px 28px;font-size:14px;line-height:1.5;color:#111827">${esc(e.signature)}<br><span style="color:#6B7280">Humanup · humanup.io</span></td></tr>
</table></div>`;
}

function toText(e: MinimalEmail): string {
  const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return [
    ...e.paragraphs.map(strip),
    e.cta ? `${e.cta.label}: ${e.cta.href}` : '',
    e.note ? strip(e.note) : '',
    '',
    e.signature,
    'Humanup · humanup.io',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n\n');
}

/** Envoie depuis le Gmail de `fromUserId` si possible, sinon via le mailer de l'ATS. */
export async function sendCandidateEmail(fromUserId: string | null, to: string, subject: string, e: MinimalEmail): Promise<void> {
  const html = renderMinimalEmail(e);
  const text = toText(e);
  if (fromUserId) {
    try {
      await sendRawEmail(fromUserId, { to, subject, body: text, htmlBody: html });
      return;
    } catch (err) {
      console.warn('[Espace candidat] envoi Gmail impossible, repli sur le mailer', (err as Error).message);
    }
  }
  await sendEmail(to, subject, html, text);
}

export { esc as escapeHtml };
