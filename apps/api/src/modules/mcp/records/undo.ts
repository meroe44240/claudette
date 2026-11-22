import { Prisma } from '@prisma/client';
import prisma from '../../../lib/db.js';
import { restoreBatch, RestoreError, writeAudit } from '../../../lib/audit-trash.js';
import { RecordError } from './registry.js';
import { delegateOf } from './engine.js';

/**
 * Annulation d'un lot (un appel d'outil = un lot, son batch_id est renvoyé dans la réponse).
 * On rejoue le journal à l'envers : suppressions restaurées depuis la corbeille, modifications
 * remises à l'ancienne valeur (sauf si quelqu'un a modifié le champ depuis), créations supprimées
 * (elles partent en corbeille). Les actions externes (email, SMS) ne s'annulent pas.
 */

const MODELS = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name.toUpperCase(), m]));

function norm(v: unknown) {
  // Même forme que dans le journal (JSON) : dates en ISO, décimaux en texte.
  return JSON.stringify(v ?? null);
}

function revive(model: Prisma.DMMF.Model, field: string, v: unknown) {
  const f = model.fields.find((x) => x.name === field);
  if (!f) return v;
  if (v === null) return f.type === 'Json' ? Prisma.DbNull : null;
  if (f.type === 'DateTime' && typeof v === 'string') return new Date(v);
  if (f.type === 'DateTime' && Array.isArray(v)) return v.map((x) => new Date(x));
  return v;
}

export async function undoBatch(batchId: string, userId: string, isAdmin: boolean) {
  const entries = await prisma.auditLog.findMany({ where: { batchId }, orderBy: { createdAt: 'desc' } });
  const trash = await prisma.trashEntry.findMany({ where: { batchId, restoredAt: null }, select: { id: true } });
  if (!entries.length && !trash.length) throw new RecordError(`Nothing recorded for batch ${batchId}. Read actions and failed calls have no batch to undo.`);
  if (!isAdmin && entries.some((e) => e.userId && e.userId !== userId)) {
    throw new RecordError('You can only undo your own actions. Ask an admin to undo this one.');
  }
  const already = await prisma.auditLog.findFirst({ where: { action: 'UNDO', metadata: { path: ['undo_of'], equals: batchId } } });
  if (already) throw new RecordError(`This batch was already undone on ${already.createdAt.toISOString()}. To redo it, undo the undo: batch ${already.batchId}.`);

  const reverted: Array<{ action: string; entity: string; id: string | null; label: string | null; detail?: unknown }> = [];
  const skipped: Array<{ action: string; entity: string; id: string | null; label: string | null; reason: string }> = [];

  // 1. Suppressions : la corbeille remet le lot entier.
  if (trash.length) {
    try {
      const r = await restoreBatch(prisma, batchId);
      for (const x of r.restored) reverted.push({ action: 'DELETE', entity: x.model, id: x.id, label: x.label, detail: 'restored from trash' });
    } catch (err) {
      skipped.push({ action: 'DELETE', entity: '-', id: null, label: null, reason: err instanceof RestoreError ? err.message : String(err) });
    }
  }

  // 2. Le reste, du plus récent au plus ancien.
  for (const e of entries) {
    const model = MODELS.get(e.entityType);
    const base = { action: e.action, entity: model?.name ?? e.entityType, id: e.entityId, label: e.entityLabel };
    if (e.action === 'DELETE') {
      if ((e.metadata as any)?.definitive) skipped.push({ ...base, reason: 'Definitive deletion (GDPR erasure) cannot be undone.' });
      continue;
    }
    if (e.action === 'UNDO') continue;
    if (e.action === 'EXTERNAL') { skipped.push({ ...base, reason: 'External action (email, SMS, call, portal access…) already happened outside Propium and cannot be undone.' }); continue; }
    if (!model) { skipped.push({ ...base, reason: 'Unknown record type.' }); continue; }
    const d = delegateOf(prisma, model.name);
    if (e.action === 'UPDATE') {
      if (!e.entityId) { skipped.push({ ...base, reason: 'No record id in the journal.' }); continue; }
      const current = await d.findUnique({ where: { id: e.entityId } });
      if (!current) { skipped.push({ ...base, reason: 'The record no longer exists.' }); continue; }
      const changes = (e.changes ?? {}) as Record<string, { old: unknown; new: unknown }>;
      const data: Record<string, unknown> = {};
      const conflicts: string[] = [];
      for (const [field, c] of Object.entries(changes)) {
        if (!(field in current)) continue;
        if (norm(current[field]) === norm(c.new)) data[field] = revive(model, field, c.old);
        else conflicts.push(field);
      }
      if (Object.keys(data).length) {
        try {
          await d.update({ where: { id: e.entityId }, data });
          reverted.push({ ...base, detail: { fields: Object.keys(data) } });
        } catch (err: any) {
          skipped.push({ ...base, reason: `Could not revert: ${err?.code === 'P2002' ? 'another record now uses the old value' : String(err?.message ?? err).split('\n').pop()}` });
          continue;
        }
      }
      if (conflicts.length) skipped.push({ ...base, reason: `Changed again since by someone else, kept as is: ${conflicts.join(', ')}.` });
      continue;
    }
    if (e.action === 'CREATE' || e.action === 'RESTORE') {
      if (!e.entityId) { skipped.push({ ...base, reason: 'Bulk insert without record ids cannot be undone.' }); continue; }
      const exists = await d.findUnique({ where: { id: e.entityId }, select: { id: true } });
      if (!exists) continue; // déjà supprimé (par exemple en cascade d'une autre annulation)
      try {
        await d.delete({ where: { id: e.entityId } });
        reverted.push({ ...base, detail: 'deleted (in trash for 30 days)' });
      } catch (err: any) {
        skipped.push({ ...base, reason: err?.code === 'P2003' ? 'Other records now depend on it; delete them first.' : String(err?.message ?? err).split('\n').pop()! });
      }
    }
  }

  await writeAudit(prisma, [{ action: 'UNDO', model: 'BATCH', label: `Undo of ${batchId}`, metadata: { undo_of: batchId, reverted: reverted.length, skipped: skipped.length } }]);
  return {
    undone_batch: batchId,
    summary: { reverted: reverted.length, skipped: skipped.length },
    reverted,
    skipped,
  };
}
