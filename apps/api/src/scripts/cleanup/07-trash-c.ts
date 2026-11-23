/**
 * Step 7: class C records go to the trash (never a hard DELETE), unless a protection rule applies.
 * - Candidates / contacts: no usable identifier and nothing substantive, or obvious test records.
 * - Companies: test/placeholder names, or orphan companies (no link at all) that are nobody's
 *   current employer and have no domain or LinkedIn.
 * Their activities go to the trash in the same batch. Every trash entry carries
 * tool_name = 'cleanup-2026-11'; restore with 99-restore.ts (one call restores everything).
 *   npx tsx src/scripts/cleanup/07-trash-c.ts [--apply]
 */
import fs from 'fs';
import path from 'path';
import {
  runStep, prisma, rawPrisma, tableTotals, APPLY, OUT_DIR, candidatClass, clientClass, entrepriseClass, isTestCompany,
  protectedCandidats, protectedClients, protectedEntreprises, companyName, blank,
} from './lib.js';

const fold = (s: string | null | undefined) => (companyName(s) ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const FAKE_PHONES = new Set(['+33600000000', '+33612345678', '+33700000000', '+33100000000', '+33123456789']);
const TEST_EMAIL = /@(example\.(com|org|fr)|test\.(com|fr)|mailinator\.com|yopmail\.com)$/i;
/** Obvious test data: a name token starting with "test", robot/dummy names, fake phones or test email domains. */
function isTestPerson(p: { prenom: string | null; nom: string; email: string | null; telephone: string | null }) {
  const tokens = `${p.prenom ?? ''} ${p.nom}`.split(/[\s_-]+/).filter(Boolean);
  const nameTest = tokens.some((t) => /^test/i.test(t)) || /^(robot|dummy|fake|demo)$/i.test(tokens[0] ?? '');
  return nameTest || (!!p.telephone && FAKE_PHONES.has(p.telephone)) || (!!p.email && TEST_EMAIL.test(p.email));
}

runStep('07-trash-c', async (ctx) => {
  const totals = await tableTotals();
  const [pc, pcl, pe] = await Promise.all([protectedCandidats(), protectedClients(), protectedEntreprises()]);
  const plan: { model: 'Candidat' | 'Client' | 'Entreprise'; id: string; label: string; reason: string }[] = [];
  const keptProtected: { model: string; id: string; label: string; reason: string }[] = [];

  for (const c of await rawPrisma.candidat.findMany({ select: { id: true, prenom: true, nom: true, email: true, telephone: true, linkedinUrl: true, posteActuel: true, entrepriseActuelle: true, localisation: true, anneesExperience: true, cvUrl: true, cvTexte: true } })) {
    const label = [c.prenom, c.nom].filter(Boolean).join(' ');
    const reason = isTestPerson(c) ? 'test record' : candidatClass(c) === 'C' ? 'class C: no identifier, no usable data' : null;
    if (!reason) continue;
    (pc.has(c.id) ? keptProtected : plan).push({ model: 'Candidat', id: c.id, label, reason });
  }
  for (const c of await rawPrisma.client.findMany({ select: { id: true, prenom: true, nom: true, email: true, telephone: true, linkedinUrl: true, poste: true } })) {
    const label = [c.prenom, c.nom].filter(Boolean).join(' ');
    const reason = isTestPerson(c) ? 'test record' : clientClass(c) === 'C' ? 'class C: no identifier, no usable name' : null;
    if (!reason) continue;
    (pcl.has(c.id) ? keptProtected : plan).push({ model: 'Client', id: c.id, label, reason });
  }
  const employers = new Set((await rawPrisma.candidat.findMany({ where: { entrepriseActuelle: { not: null } }, select: { entrepriseActuelle: true } })).map((c) => fold(c.entrepriseActuelle)));
  const recent = new Date(Date.now() - 60 * 86_400_000);
  for (const e of await rawPrisma.entreprise.findMany({ select: { id: true, nom: true, domaine: true, siteWeb: true, secteur: true, taille: true, localisation: true, linkedinUrl: true, notes: true, siren: true, createdAt: true } })) {
    let reason: string | null = null;
    if (isTestCompany(e.nom) || /\btest\b/i.test(e.nom) || /^test/i.test(e.nom) || entrepriseClass(e) === 'C') reason = 'test or placeholder company';
    else if (!pe.has(e.id) && !employers.has(fold(e.nom)) && blank(e.domaine) && blank(e.siteWeb) && blank(e.linkedinUrl)
      && blank(e.notes) && blank(e.siren) && e.createdAt < recent) reason = 'orphan company: no link, no domain, no LinkedIn, no notes';
    if (!reason) continue;
    (pe.has(e.id) ? keptProtected : plan).push({ model: 'Entreprise', id: e.id, label: e.nom, reason });
  }

  for (const p of plan) ctx.log({ model: p.model, id: p.id, label: p.label, field: '*trash*', old: p.label, new: null, reason: p.reason });
  await ctx.summary(totals);
  console.log(`Protected records that match C rules but are kept (linked to a mandate/candidature/interaction): ${keptProtected.length}`);
  for (const k of keptProtected.slice(0, 15)) console.log(`  kept ${k.model} ${k.label} (${k.reason})`);
  fs.writeFileSync(path.join(OUT_DIR, `trash_plan_${APPLY ? 'apply' : 'dry'}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify({ plan, keptProtected }, null, 2));
  if (!APPLY) return;

  let done = 0;
  for (const p of plan) {
    try {
      const entiteType = p.model === 'Candidat' ? 'CANDIDAT' : p.model === 'Client' ? 'CLIENT' : 'ENTREPRISE';
      await prisma.activite.deleteMany({ where: { entiteType, entiteId: p.id } }); // into the trash, same batch
      if (p.model === 'Candidat') await prisma.candidat.delete({ where: { id: p.id } });
      else if (p.model === 'Client') await prisma.client.delete({ where: { id: p.id } });
      else await prisma.entreprise.delete({ where: { id: p.id } });
      done++;
    } catch (err) {
      console.log(`  ERROR trashing ${p.model} ${p.id} ${p.label}: ${(err as Error).message.split('\n').pop()}`);
    }
  }
  console.log(`Trashed ${done}/${plan.length} records (batch ${ctx.batchId}).`);
});
