import { rawPrisma } from '../../lib/db.js';
import { sendEmail, renderBrandedEmail } from '../../lib/mailer.js';

/**
 * Notifications à l'équipe qui passaient par Slack et ne sont pas des annonces #news :
 * envoyées par email, en anglais (emails internes à l'équipe).
 */

const appUrl = () => (process.env.APP_URL || 'https://ats.propium.co').replace(/\/$/, '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** @mention dans une note ou une activité : un email à chaque personne mentionnée. */
export async function notifyMention(data: {
  mentionedUserIds: string[];
  byName: string | null;
  contextLabel: string;
  excerpt: string;
  link?: string | null;
}): Promise<void> {
  if (!data.mentionedUserIds.length) return;
  const users = await rawPrisma.user.findMany({
    where: { id: { in: data.mentionedUserIds }, status: 'ACTIVE', estAgent: false },
    select: { email: true, prenom: true },
  });
  const by = data.byName || 'Someone';
  for (const u of users) {
    if (!u.email) continue;
    const html = renderBrandedEmail({
      lang: 'en',
      title: `${by} mentioned you`,
      bodyHtml: `<p>Hi ${esc(u.prenom || '')},</p><p><b>${esc(by)}</b> mentioned you on ${esc(data.contextLabel)}:</p>`
        + (data.excerpt ? `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #E6E9AF;color:#333;">${esc(data.excerpt.slice(0, 600))}</blockquote>` : ''),
      cta: { label: 'Open in Propium', href: data.link || appUrl() },
    });
    await sendEmail(u.email, `${by} mentioned you on ${data.contextLabel}`, html).catch((err) =>
      console.error('[team-email] mention:', (err as Error).message));
  }
}

/** Demande de validation d'un contrat hors standard : un email à chaque admin. */
export async function notifyContractApprovalRequest(data: {
  mandatTitre: string;
  entrepriseNom: string;
  feeRequested: number;
  reason: string;
  requestedByPrenom: string | null;
  approvalId: string;
  exceptionLabels?: string[];
  customClause?: string | null;
}): Promise<void> {
  const admins = await rawPrisma.user.findMany({
    where: { role: 'ADMIN', status: 'ACTIVE', estAgent: false },
    select: { email: true, prenom: true },
  });
  const asker = data.requestedByPrenom || 'A recruiter';
  const what = data.exceptionLabels?.length
    ? `<p>${esc(asker)} is requesting non-standard contract terms:</p><ul>${data.exceptionLabels.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
    : `<p>${esc(asker)} is requesting a fee of <b>${data.feeRequested}%</b> (below the 18% floor).</p>`;
  const clause = data.customClause
    ? `<p><i>Clause:</i></p><blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #E6E9AF;">${esc(data.customClause.slice(0, 1500))}</blockquote>`
    : '';
  const html = renderBrandedEmail({
    lang: 'en',
    title: 'Contract approval required',
    bodyHtml: `${what}<p>${esc(data.entrepriseNom)} · ${esc(data.mandatTitre)}</p><p><i>Reason:</i> ${esc(data.reason)}</p>${clause}`
      + '<p>Approve or reject it from Claude (HumanUp ATS connector): "show pending contract approvals".</p>',
  });
  for (const a of admins) {
    if (!a.email) continue;
    await sendEmail(a.email, `Contract approval required: ${data.entrepriseNom} · ${data.mandatTitre}`, html).catch((err) =>
      console.error('[team-email] contract approval:', (err as Error).message));
  }
}
