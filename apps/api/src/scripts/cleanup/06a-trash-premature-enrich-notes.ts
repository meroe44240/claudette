/**
 * One-off fix for the first 06-enrich run: the FullEnrich helper returned before the jobs had
 * finished, so "FullEnrich: no email found" notes were written for every target. They are moved to
 * the trash (tagged cleanup-2026-11) so the resumed run writes the real outcome. Idempotent.
 *   npx tsx src/scripts/cleanup/06a-trash-premature-enrich-notes.ts [--apply]
 */
import { runStep, prisma, rawPrisma, APPLY } from './lib.js';

runStep('06a-trash-premature-enrich-notes', async (ctx) => {
  const where = { titre: 'FullEnrich: no email found', metadata: { path: ['cleanup'], equals: 'cleanup-2026-11' } } as const;
  const n = await rawPrisma.activite.count({ where });
  console.log(`Premature "no email found" notes: ${n}`);
  if (APPLY && n) {
    const r = await prisma.activite.deleteMany({ where });
    console.log(`Moved ${r.count} notes to the trash (batch ${ctx.batchId}).`);
  }
});
