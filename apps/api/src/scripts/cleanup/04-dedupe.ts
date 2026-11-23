/**
 * Step 4: merge duplicates (candidates, then companies, then client contacts).
 * Master = most complete record, then oldest. Relations are moved to the master by the app's own
 * merge service (modules/merge), which never overwrites a filled value with an empty one; the
 * absorbed record goes to the trash (tool_name = cleanup-2026-11), so it can be restored.
 * Rows the merge service does not move yet (presentations, target profiles, ownerships) are moved first.
 * Ambiguous groups (same identifier, different names / SIREN, two candidate accounts) are only reported.
 *   npx tsx src/scripts/cleanup/04-dedupe.ts [--apply] [--only=candidats|entreprises|clients]
 */
import fs from 'fs';
import path from 'path';
import { runStep, rawPrisma, APPLY, OUT_DIR, TAG, candidatScore, entrepriseScore, clientScore } from './lib.js';
import { findDuplicateGroups, type Group } from './dupes.js';
import { mergeCandidats, mergeEntreprises, mergeClients } from '../../modules/merge/merge.service.js';

const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];

runStep('04-dedupe', async (ctx) => {
  const groups = await findDuplicateGroups();
  const report: any = { at: new Date().toISOString(), apply: APPLY, merged: [], ambiguous: [], errors: [] };

  const audit = async (model: string, id: string, label: string, changes: Record<string, unknown>, reason: string) => {
    ctx.log({ model, id, label, field: Object.keys(changes).join(','), old: null, new: changes, reason });
    if (APPLY) await rawPrisma.auditLog.create({ data: { userId: ctx.userId, action: 'UPDATE', entityType: model.toUpperCase(), entityId: id, entityLabel: label, changes: changes as any, metadata: { step: ctx.step, reason, tag: TAG } as any, source: 'SYSTEM', toolName: TAG, batchId: ctx.batchId } });
  };

  async function run<T extends { id: string; createdAt: Date }>(
    kind: 'candidats' | 'entreprises' | 'clients', list: Group[], load: (ids: string[]) => Promise<T[]>, score: (r: T) => number,
    label: (r: T) => string, preMove: (masterId: string, dupId: string) => Promise<string[]>, merge: (m: string, d: string) => Promise<unknown>,
    extraCheck?: (rows: T[]) => Promise<string | null>,
  ) {
    if (only && only !== kind) return;
    let merged = 0;
    for (const g of list) {
      const rows = await load(g.ids);
      if (rows.length < 2) continue; // already merged (idempotent re-run)
      const extra = g.safe && extraCheck ? await extraCheck(rows) : null;
      if (!g.safe || extra) {
        report.ambiguous.push({ kind, why: g.why ?? extra, keys: g.keys, records: rows.map((r) => ({ id: r.id, label: label(r), score: score(r) })) });
        continue;
      }
      rows.sort((a, b) => score(b) - score(a) || a.createdAt.getTime() - b.createdAt.getTime());
      const [master, ...dups] = rows;
      for (const d of dups) {
        const entry = { kind, master: { id: master.id, label: label(master), score: score(master) }, duplicate: { id: d.id, label: label(d), score: score(d) }, keys: g.keys };
        ctx.log({ model: kind, id: d.id, label: label(d), field: '*merge*', old: d.id, new: master.id, reason: `duplicate of ${label(master)} (${g.keys.join(', ')})` });
        if (APPLY) {
          try {
            const moved = await preMove(master.id, d.id);
            if (moved.length) await audit(kind === 'candidats' ? 'Candidat' : kind === 'entreprises' ? 'Entreprise' : 'Client', master.id, label(master), { movedFrom: d.id, rows: moved }, 'rows moved to master before merge');
            const res = await merge(master.id, d.id);
            report.merged.push({ ...entry, result: res, preMoved: moved });
            merged++;
          } catch (err) {
            report.errors.push({ ...entry, error: (err as Error).message });
            console.log(`  ERROR merging ${kind} ${d.id} -> ${master.id}: ${(err as Error).message}`);
          }
        } else report.merged.push(entry);
      }
    }
    console.log(`${kind}: ${list.length} groups, ${report.merged.filter((m: any) => m.kind === kind).length} merges ${APPLY ? 'done' : 'planned'} (${merged} applied), ${report.ambiguous.filter((a: any) => a.kind === kind).length} ambiguous groups`);
  }

  const candSelect = { id: true, createdAt: true, prenom: true, nom: true, email: true, telephone: true, linkedinUrl: true, posteActuel: true, entrepriseActuelle: true, localisation: true, anneesExperience: true, cvUrl: true } as const;
  await run('candidats', groups.candidats,
    (ids) => rawPrisma.candidat.findMany({ where: { id: { in: ids } }, select: candSelect }) as any,
    candidatScore as any, (r: any) => [r.prenom, r.nom].filter(Boolean).join(' '),
    async (m, d) => {
      const out: string[] = [];
      // Presentations cascade on candidate deletion: move them first.
      const masterCands = await rawPrisma.candidature.findMany({ where: { candidatId: m }, select: { id: true, mandatId: true } });
      const dupCands = await rawPrisma.candidature.findMany({ where: { candidatId: d }, select: { id: true, mandatId: true } });
      for (const p of await rawPrisma.presentation.findMany({ where: { candidatId: d } })) {
        let candidatureId = p.candidatureId;
        const dc = dupCands.find((c) => c.id === p.candidatureId);
        const mc = dc && masterCands.find((c) => c.mandatId === dc.mandatId);
        if (mc) candidatureId = (await rawPrisma.presentation.findFirst({ where: { candidatureId: mc.id } })) ? null : mc.id;
        await rawPrisma.presentation.update({ where: { id: p.id }, data: { candidatId: m, candidatureId } });
        out.push(`presentation:${p.id}`);
      }
      const o = await rawPrisma.ownership.updateMany({ where: { entiteId: d }, data: { entiteId: m } });
      if (o.count) out.push(`ownerships:${o.count}`);
      return out;
    },
    (m, d) => mergeCandidats(m, d, ctx.userId),
    async (rows) => ((await rawPrisma.candidateAccount.count({ where: { candidatId: { in: rows.map((r) => r.id) } } })) > 1 ? 'both have a candidate space account' : null),
  );

  const entSelect = { id: true, createdAt: true, nom: true, domaine: true, siteWeb: true, secteur: true, taille: true, localisation: true, linkedinUrl: true } as const;
  await run('entreprises', groups.entreprises,
    (ids) => rawPrisma.entreprise.findMany({ where: { id: { in: ids } }, select: entSelect }) as any,
    entrepriseScore as any, (r: any) => r.nom,
    async (m, d) => {
      const out: string[] = [];
      const p = await rawPrisma.presentation.updateMany({ where: { entrepriseId: d }, data: { entrepriseId: m } });
      if (p.count) out.push(`presentations:${p.count}`);
      const pr = await rawPrisma.profilRecherche.updateMany({ where: { entrepriseId: d }, data: { entrepriseId: m } });
      if (pr.count) out.push(`profils_recherches:${pr.count}`);
      const o = await rawPrisma.ownership.updateMany({ where: { entiteId: d }, data: { entiteId: m } });
      if (o.count) out.push(`ownerships:${o.count}`);
      return out;
    },
    (m, d) => mergeEntreprises(m, d, ctx.userId),
  );

  // Contacts are re-detected after company merges (contacts of merged companies now share a company).
  const fresh = only === 'clients' || !only ? (await findDuplicateGroups()).clients : [];
  const cliSelect = { id: true, createdAt: true, prenom: true, nom: true, email: true, telephone: true, linkedinUrl: true, poste: true } as const;
  await run('clients', APPLY ? fresh : groups.clients,
    (ids) => rawPrisma.client.findMany({ where: { id: { in: ids } }, select: cliSelect }) as any,
    clientScore as any, (r: any) => [r.prenom, r.nom].filter(Boolean).join(' '),
    async (m, d) => {
      const p = await rawPrisma.presentation.updateMany({ where: { clientId: d }, data: { clientId: m } });
      return p.count ? [`presentations:${p.count}`] : [];
    },
    (m, d) => mergeClients(m, d, ctx.userId),
  );

  const file = path.join(OUT_DIR, `dedupe_${APPLY ? 'apply' : 'dry'}_${report.at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`Report: ${file}`);
  console.log('Examples of planned merges:');
  for (const m of report.merged.slice(0, 20)) console.log(`  [${m.kind}] "${m.duplicate.label}" (${m.duplicate.score}) -> "${m.master.label}" (${m.master.score})  ${m.keys.join(' ')}`);
  console.log('Ambiguous groups:');
  for (const a of report.ambiguous) console.log(`  [${a.kind}] ${a.why}: ${a.records.map((r: any) => r.label).join(' | ')}  ${a.keys.join(' ')}`);
});
