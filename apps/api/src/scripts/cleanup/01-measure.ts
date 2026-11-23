/**
 * Step 1: completeness score and A/B/C class per record + duplicate counts. Read only.
 * Writes a JSON snapshot (label from argv: before | after | weekly) in OUT_DIR.
 *   npx tsx src/scripts/cleanup/01-measure.ts before
 */
import fs from 'fs';
import path from 'path';
import {
  rawPrisma, OUT_DIR, candidatClass, candidatScore, entrepriseClass, entrepriseScore, clientClass, clientScore,
  protectedCandidats, protectedClients, protectedEntreprises,
} from './lib.js';
import { findDuplicateGroups } from './dupes.js';

export async function measure() {
  const [cands, ents, clis, pc, pcl, pe] = await Promise.all([
    rawPrisma.candidat.findMany({ select: { id: true, prenom: true, nom: true, email: true, telephone: true, linkedinUrl: true, posteActuel: true, entrepriseActuelle: true, localisation: true, anneesExperience: true, cvUrl: true, cvTexte: true } }),
    rawPrisma.entreprise.findMany({ select: { id: true, nom: true, domaine: true, siteWeb: true, secteur: true, taille: true, localisation: true, linkedinUrl: true } }),
    rawPrisma.client.findMany({ select: { id: true, prenom: true, nom: true, email: true, telephone: true, linkedinUrl: true, poste: true, entrepriseId: true } }),
    protectedCandidats(), protectedClients(), protectedEntreprises(),
  ]);
  const tally = <T extends { id: string }>(rows: T[], cls: (r: T) => string, score: (r: T) => number, max: number, prot: Set<string>) => {
    const out = { total: rows.length, A: 0, B: 0, C: 0, C_protected: 0, avgScorePct: 0, protected: prot.size, completePct: 0 };
    let sum = 0;
    for (const r of rows) {
      const c = cls(r) as 'A' | 'B' | 'C';
      out[c]++;
      if (c === 'C' && prot.has(r.id)) out.C_protected++;
      sum += score(r) / max;
    }
    out.avgScorePct = rows.length ? Math.round((1000 * sum) / rows.length) / 10 : 0;
    out.completePct = rows.length ? Math.round((1000 * out.A) / rows.length) / 10 : 0;
    return out;
  };
  const dupes = await findDuplicateGroups();
  const snap = {
    at: new Date().toISOString(),
    candidats: tally(cands as any[], candidatClass as any, candidatScore as any, 8, pc),
    entreprises: tally(ents as any[], entrepriseClass as any, entrepriseScore as any, 6, pe),
    clients: tally(clis as any[], clientClass as any, clientScore as any, 5, pcl),
    duplicates: {
      candidats: { groups: dupes.candidats.length, extra: dupes.candidats.reduce((s, g) => s + g.ids.length - 1, 0) },
      entreprises: { groups: dupes.entreprises.length, extra: dupes.entreprises.reduce((s, g) => s + g.ids.length - 1, 0) },
      clients: { groups: dupes.clients.length, extra: dupes.clients.reduce((s, g) => s + g.ids.length - 1, 0) },
    },
    counts: {
      leads: await rawPrisma.lead.count(), mandats: await rawPrisma.mandat.count(), candidatures: await rawPrisma.candidature.count(),
      presentations: await rawPrisma.presentation.count(), activites: await rawPrisma.activite.count(),
    },
    orphanClients: clis.filter((c) => !ents.some((e) => e.id === c.entrepriseId)).length,
  };
  return snap;
}

if (process.argv[1]?.endsWith('01-measure.ts')) {
  const label = process.argv[2] || 'snapshot';
  measure().then((snap) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `measure_${label}_${snap.at.replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(snap, null, 2));
    console.log(JSON.stringify(snap, null, 2));
    console.log(`Saved ${file}`);
  }).finally(() => rawPrisma.$disconnect());
}
