/**
 * Step 5: attachments.
 * - Client contacts always point to a company (NOT NULL foreign key): only checked.
 * - Leads without a company are linked to an existing company when exactly one company has the
 *   same normalised name.
 * - Orphan companies (no contact, mandate, lead, presentation, target profile, list, activity) are
 *   listed; those that are nobody's current employer and have no domain/LinkedIn are C candidates
 *   (trashed by 07-trash-c).
 *   npx tsx src/scripts/cleanup/05-attach.ts [--apply]
 */
import fs from 'fs';
import path from 'path';
import { runStep, rawPrisma, tableTotals, OUT_DIR, companyName, protectedEntreprises, blank } from './lib.js';

const fold = (s: string | null | undefined) => (companyName(s) ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

runStep('05-attach', async (ctx) => {
  const totals = await tableTotals();
  const orphanClients = await rawPrisma.$queryRawUnsafe<{ n: bigint }[]>(`select count(*) n from clients c where not exists (select 1 from entreprises e where e.id = c."entrepriseId")`);
  console.log(`Client contacts without an existing company: ${orphanClients[0].n}`);

  const ents = await rawPrisma.entreprise.findMany({ select: { id: true, nom: true, domaine: true, linkedinUrl: true } });
  const byName = new Map<string, string[]>();
  for (const e of ents) { const k = fold(e.nom); if (k.length < 2) continue; byName.set(k, [...(byName.get(k) ?? []), e.id]); }

  // Companies auto-created from an email domain (webmail, anti-spam, no-reply): never link to them.
  const PSEUDO = new Set(['hotmail', 'yahoo', 'ymail', 'live', 'mail', 'rocketmail', 'gmail', 'googlemail', 'outlook', 'icloud', 'me', 'orange', 'free', 'sfr', 'wanadoo', 'laposte', 'invitations', 'edu', 'gmx', 'aol', 'msn', 'protonmail', 'proton', 'bbox', 'neuf', 'noreply', 'notifications', 'calendar']);
  let ambiguous = 0;
  for (const l of await rawPrisma.lead.findMany({ where: { entrepriseId: null }, select: { id: true, company: true, contact: true } })) {
    if (PSEUDO.has(fold(l.company))) continue;
    const ids = byName.get(fold(l.company)) ?? [];
    if (ids.length === 1) ctx.log({ model: 'Lead', id: l.id, label: l.contact, field: 'entrepriseId', old: null, new: ids[0], reason: `linked to existing company "${l.company}"` });
    else if (ids.length > 1) ambiguous++;
  }
  console.log(`Leads matching several companies (left unlinked): ${ambiguous}`);

  // Orphan companies
  const prot = await protectedEntreprises();
  const employers = new Set((await rawPrisma.candidat.findMany({ where: { entrepriseActuelle: { not: null } }, select: { entrepriseActuelle: true } })).map((c) => fold(c.entrepriseActuelle)));
  const orphans = ents.filter((e) => !prot.has(e.id));
  const orphanReport = orphans.map((e) => ({ id: e.id, nom: e.nom, employerOfCandidate: employers.has(fold(e.nom)), hasIdentifier: !blank(e.domaine) || !blank(e.linkedinUrl) }));
  const cCandidates = orphanReport.filter((o) => !o.employerOfCandidate && !o.hasIdentifier);
  console.log(`Orphan companies: ${orphans.length} (current employer of a candidate: ${orphanReport.filter((o) => o.employerOfCandidate).length}, with domain/LinkedIn: ${orphanReport.filter((o) => o.hasIdentifier).length}, C candidates: ${cCandidates.length})`);
  fs.writeFileSync(path.join(OUT_DIR, `orphan_companies_${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(orphanReport, null, 2));

  await ctx.summary(totals);
  await ctx.applyUpdates();
});
