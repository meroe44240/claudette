/**
 * Restores everything the 2026-11 cleanup put in the trash (merged duplicates, class C records,
 * premature enrichment notes), i.e. every trash batch whose entries carry tool_name = 'cleanup-2026-11'.
 * Uses the app's own restore (lib/audit-trash.ts restoreBatch): rows that still exist are skipped.
 * Note: the trash is purged after 30 days (trash.service purgeExpired); after that, use the pg_dump.
 *   npx tsx src/scripts/cleanup/99-restore-trash.ts [--apply] [--batch=<uuid>]
 */
import { runStep, rawPrisma, APPLY, TAG } from './lib.js';
import { restoreBatch } from '../../lib/audit-trash.js';

const only = process.argv.find((a) => a.startsWith('--batch='))?.split('=')[1];

runStep('99-restore-trash', async () => {
  const batches = await rawPrisma.trashEntry.groupBy({ by: ['batchId'], where: { toolName: TAG, restoredAt: null, ...(only ? { batchId: only } : {}) }, _count: { _all: true } });
  console.log(`Trash batches tagged ${TAG} not yet restored: ${batches.length}`);
  for (const b of batches) {
    console.log(`  batch ${b.batchId}: ${b._count._all} entries`);
    if (!APPLY) continue;
    try {
      const r = await restoreBatch(rawPrisma, b.batchId);
      console.log(`    restored ${r.restored.length}, skipped ${r.skipped.length} (already present)`);
    } catch (err) {
      console.log(`    ERROR: ${(err as Error).message}`);
    }
  }
});
