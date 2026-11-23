/**
 * Contrôle hebdomadaire de la qualité des données (lundi ~7h, heure de Paris) :
 * recalcule le score de complétude (classes A / B / C), compte les doublons et envoie un récapitulatif
 * aux administrateurs (email interne, en anglais). Lecture seule : rien n'est modifié ni fusionné.
 * Les règles sont celles du nettoyage de novembre 2026 (scripts/cleanup).
 */
import prisma from '../lib/db.js';
import { sendEmail, renderBrandedEmail, escapeHtml } from '../lib/mailer.js';
import { measure } from '../scripts/cleanup/01-measure.js';
import { findDuplicateGroups } from '../scripts/cleanup/dupes.js';

const LAST_KEY = 'data-quality-weekly';

export async function runDataQualityWeekly() {
  const snap = await measure();
  const dupes = await findDuplicateGroups();

  // Comparaison avec la semaine précédente (dernier rapport gardé dans audit_logs)
  const prev = await prisma.auditLog.findFirst({ where: { action: 'EXTERNAL', entityType: 'DATA_QUALITY', toolName: LAST_KEY }, orderBy: { createdAt: 'desc' } });
  const before = (prev?.after ?? null) as typeof snap | null;
  await prisma.auditLog.create({ data: { action: 'EXTERNAL', entityType: 'DATA_QUALITY', entityLabel: 'Weekly data quality check', after: snap as any, source: 'SYSTEM', toolName: LAST_KEY } });

  const delta = (now: number, was?: number) => (was === undefined ? '' : now === was ? ' (=)' : ` (${now > was ? '+' : ''}${Math.round((now - was) * 10) / 10})`);
  const row = (label: string, t: typeof snap.candidats, w?: typeof snap.candidats) =>
    `<tr><td>${label}</td><td>${t.total}${delta(t.total, w?.total)}</td><td>${t.completePct} %${delta(t.completePct, w?.completePct)}</td><td>${t.A} / ${t.B} / ${t.C}</td><td>${t.C - t.C_protected}</td></tr>`;
  const groups = (kind: string, list: typeof dupes.candidats) => list.slice(0, 10).map((g) => `<li>${escapeHtml(kind)} · ${g.ids.length} records · ${escapeHtml(g.keys.slice(0, 2).join(', '))}${g.safe ? '' : ' · needs review'}</li>`).join('');

  const bodyHtml = `
    <p>Weekly check of the Propium database (read only, nothing was changed).</p>
    <table cellpadding="6" style="border-collapse:collapse;font-size:13px">
      <tr style="text-align:left"><th>Table</th><th>Records</th><th>Complete (A)</th><th>A / B / C</th><th>C to trash</th></tr>
      ${row('Candidates', snap.candidats, before?.candidats)}
      ${row('Companies', snap.entreprises, before?.entreprises)}
      ${row('Client contacts', snap.clients, before?.clients)}
    </table>
    <p><b>Duplicates:</b> ${snap.duplicates.candidats.groups} candidate groups, ${snap.duplicates.entreprises.groups} company groups, ${snap.duplicates.clients.groups} contact groups.</p>
    ${dupes.candidats.length + dupes.entreprises.length + dupes.clients.length ? `<ul>${groups('Candidate', dupes.candidats)}${groups('Company', dupes.entreprises)}${groups('Contact', dupes.clients)}</ul>
    <p>Safe groups can be merged with scripts/cleanup/04-dedupe.ts or merge_candidates / merge_companies / merge_clients.</p>` : '<p>No duplicates found.</p>'}`;

  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', estAgent: false, status: 'ACTIVE' }, select: { email: true } });
  const html = renderBrandedEmail({ title: 'Weekly data quality check', bodyHtml, lang: 'en' });
  for (const a of admins) if (a.email) await sendEmail(a.email, 'Propium: weekly data quality check', html);
  return { recipients: admins.length, duplicates: snap.duplicates, candidats: snap.candidats.completePct };
}
