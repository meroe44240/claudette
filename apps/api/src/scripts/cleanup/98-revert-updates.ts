/**
 * Reverts the field changes made by the 2026-11 cleanup (normalisation, misplaced fields, lead
 * links, enrichment), newest first, from audit_logs (tool_name = 'cleanup-2026-11', action UPDATE,
 * changes = { field: { old, new } }). A field is only reverted if it still holds the cleanup's value,
 * so later edits by the team are never overwritten. Merge bookkeeping rows are ignored.
 *   npx tsx src/scripts/cleanup/98-revert-updates.ts [--apply] [--step=02-normalize]
 */
import { runStep, rawPrisma, APPLY, TAG } from './lib.js';

const step = process.argv.find((a) => a.startsWith('--step='))?.split('=')[1];
const MODEL: Record<string, string> = { CANDIDAT: 'candidat', CLIENT: 'client', ENTREPRISE: 'entreprise', LEAD: 'lead' };

runStep('98-revert-updates', async () => {
  const rows = await rawPrisma.auditLog.findMany({ where: { toolName: TAG, action: 'UPDATE' }, orderBy: { createdAt: 'desc' } });
  let reverted = 0, skipped = 0;
  for (const r of rows) {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    if (step && meta.step !== step) continue;
    const d = MODEL[r.entityType];
    if (!d || !r.entityId || !r.changes) continue;
    const changes = r.changes as Record<string, { old: unknown; new: unknown }>;
    if ('movedFrom' in changes) continue; // merge bookkeeping
    const cur = await (rawPrisma as any)[d].findUnique({ where: { id: r.entityId } });
    if (!cur) { skipped++; continue; }
    const data: Record<string, unknown> = {};
    for (const [field, c] of Object.entries(changes)) {
      if (!c || typeof c !== 'object' || !('old' in c)) continue;
      if (JSON.stringify(cur[field] ?? null) === JSON.stringify(c.new ?? null)) data[field] = c.old;
      else skipped++;
    }
    if (!Object.keys(data).length) continue;
    if (APPLY) await (rawPrisma as any)[d].update({ where: { id: r.entityId }, data });
    reverted++;
  }
  console.log(`${APPLY ? 'Reverted' : 'Would revert'} ${reverted} records; ${skipped} fields skipped (changed since, or record gone).`);
});
