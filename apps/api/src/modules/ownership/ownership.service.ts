import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';

/**
 * Propriété d'une société, d'un lead ou d'un contact client : une seule personne (humain ou
 * agent) a la main à un instant donné. claim → prend si libre (ou si c'est déjà soi : prolonge),
 * sinon renvoie le propriétaire en place sans rien changer. release → libère.
 * Les colonnes Entreprise.ownerId, Lead.ownerId et Client.assignedToId suivent la table.
 */

export type OwnedType = 'ENTREPRISE' | 'LEAD' | 'CLIENT';
export const DEFAULT_DAYS = 60;

const TYPES: Record<string, OwnedType> = {
  ENTREPRISE: 'ENTREPRISE', COMPANY: 'ENTREPRISE', SOCIETE: 'ENTREPRISE',
  LEAD: 'LEAD',
  CLIENT: 'CLIENT', CONTACT: 'CLIENT',
};

export function ownedType(v: string): OwnedType {
  const t = TYPES[String(v ?? '').trim().toUpperCase()];
  if (!t) throw new ValidationError(`Type invalide : ${v}. Valeurs : company, lead, client.`);
  return t;
}

async function loadEntity(type: OwnedType, id: string) {
  if (type === 'ENTREPRISE') {
    const e = await prisma.entreprise.findUnique({ where: { id }, select: { id: true, nom: true, ownerId: true } });
    return e ? { id: e.id, label: e.nom, legacyOwnerId: e.ownerId } : null;
  }
  if (type === 'LEAD') {
    const l = await prisma.lead.findUnique({ where: { id }, select: { id: true, company: true, contact: true, ownerId: true } });
    return l ? { id: l.id, label: `${l.company} (${l.contact})`, legacyOwnerId: l.ownerId } : null;
  }
  const c = await prisma.client.findUnique({ where: { id }, select: { id: true, prenom: true, nom: true, assignedToId: true } });
  return c ? { id: c.id, label: [c.prenom, c.nom].filter(Boolean).join(' '), legacyOwnerId: c.assignedToId } : null;
}

async function setOwnerColumn(type: OwnedType, id: string, ownerId: string | null) {
  if (type === 'ENTREPRISE') await prisma.entreprise.update({ where: { id }, data: { ownerId } });
  else if (type === 'LEAD') await prisma.lead.update({ where: { id }, data: { ownerId } });
  else await prisma.client.update({ where: { id }, data: { assignedToId: ownerId } });
}

const userSelect = { id: true, prenom: true, nom: true, estAgent: true, status: true } as const;
const userView = (u: { id: string; prenom: string | null; nom: string; estAgent: boolean } | null) =>
  u ? { id: u.id, name: [u.prenom, u.nom].filter(Boolean).join(' '), is_agent: u.estAgent } : null;

function activeWhere(type: OwnedType, id: string) {
  return { entiteType: type, entiteId: id, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

/**
 * Propriétaire actuel. La colonne (Entreprise.ownerId, Lead.ownerId, Client.assignedToId) fait
 * foi, car l'interface peut réassigner un lead ou un contact directement ; la table donne la
 * période, le motif et l'historique quand elle concorde.
 */
export async function getOwner(typeIn: string, id: string, withHistory = true) {
  const type = ownedType(typeIn);
  const ent = await loadEntity(type, id);
  if (!ent) throw new NotFoundError(type, id);
  let current: Record<string, unknown> | null = null;
  if (ent.legacyOwnerId) {
    const active = await prisma.ownership.findFirst({ where: { ...activeWhere(type, id), ownerId: ent.legacyOwnerId }, orderBy: { claimedAt: 'desc' } });
    const u = await prisma.user.findUnique({ where: { id: ent.legacyOwnerId }, select: userSelect });
    if (u) {
      current = active
        ? { owner: userView(u), since: active.claimedAt, expires_at: active.expiresAt, reason: active.motif, ownership_id: active.id }
        : { owner: userView(u), since: null, expires_at: null, reason: null, ownership_id: null, note: 'Assigned in the web app (no period recorded).' };
    }
  }
  const history = withHistory
    ? (await prisma.ownership.findMany({ where: { entiteType: type, entiteId: id }, include: { owner: { select: userSelect } }, orderBy: { claimedAt: 'desc' }, take: 50 }))
      .map((o) => ({ owner: userView(o.owner), from: o.claimedAt, to: o.releasedAt ?? (o.expiresAt && o.expiresAt < new Date() ? o.expiresAt : null), reason: o.motif, release_reason: o.releaseMotif, expired: !o.releasedAt && !!o.expiresAt && o.expiresAt < new Date() }))
    : undefined;
  return { entity: { type, id, label: ent.label }, owned: !!current, current, history };
}

export async function claim(typeIn: string, id: string, userId: string, opts: { reason?: string; days?: number; force?: boolean; isAdmin?: boolean; ownerId?: string } = {}) {
  const type = ownedType(typeIn);
  const ent = await loadEntity(type, id);
  if (!ent) throw new NotFoundError(type, id);
  const target = opts.ownerId ?? userId;
  if (opts.ownerId && opts.ownerId !== userId && !opts.isAdmin) throw new ValidationError('Seul un admin peut attribuer la propriété à quelqu\'un d\'autre.');
  const owner = await prisma.user.findUnique({ where: { id: target }, select: userSelect });
  if (!owner || owner.status !== 'ACTIVE') throw new ValidationError('Propriétaire introuvable ou compte inactif.');
  const days = Math.min(Math.max(opts.days ?? DEFAULT_DAYS, 1), 365);
  const expiresAt = new Date(Date.now() + days * 86400_000);

  const current = await getOwner(type, id, false);
  const currentOwnerId = (current.current?.owner as { id: string } | null)?.id;
  if (currentOwnerId && currentOwnerId !== target) {
    if (!(opts.force && opts.isAdmin)) {
      return {
        claimed: false, conflict: true,
        message: `Already owned by ${(current.current!.owner as any).name}. Ask them to release it${opts.isAdmin ? ', or pass force: true to take it over' : ', or ask an admin'}.`,
        entity: current.entity, current: current.current,
      };
    }
  }

  // Prolongation par le même propriétaire : on garde la période, on repousse l'échéance.
  const active = await prisma.ownership.findFirst({ where: activeWhere(type, id), orderBy: { claimedAt: 'desc' } });
  if (active && active.ownerId === target) {
    const o = await prisma.ownership.update({ where: { id: active.id }, data: { expiresAt, ...(opts.reason ? { motif: opts.reason } : {}) } });
    await setOwnerColumn(type, id, target);
    return { claimed: true, extended: true, entity: current.entity, owner: userView(owner), since: o.claimedAt, expires_at: o.expiresAt, reason: o.motif };
  }
  // Reprise forcée (admin) ou propriété ancienne sans période : on clôt ce qui reste ouvert.
  await prisma.ownership.updateMany({
    where: { entiteType: type, entiteId: id, releasedAt: null },
    data: { releasedAt: new Date(), releasedById: userId, releaseMotif: opts.force ? `Repris par un admin${opts.reason ? ` : ${opts.reason}` : ''}` : 'Remplacé' },
  });
  const o = await prisma.ownership.create({ data: { entiteType: type, entiteId: id, ownerId: target, motif: opts.reason ?? null, expiresAt } });
  await setOwnerColumn(type, id, target);
  return { claimed: true, entity: current.entity, owner: userView(owner), since: o.claimedAt, expires_at: o.expiresAt, reason: o.motif, previous_owner: currentOwnerId && currentOwnerId !== target ? current.current?.owner : undefined };
}

export async function release(typeIn: string, id: string, userId: string, opts: { reason?: string; isAdmin?: boolean } = {}) {
  const type = ownedType(typeIn);
  const current = await getOwner(type, id, false);
  if (!current.current) return { released: false, message: 'Nobody owns it.', entity: current.entity };
  const ownerId = (current.current.owner as { id: string }).id;
  if (ownerId !== userId && !opts.isAdmin) {
    return { released: false, conflict: true, message: `Owned by ${(current.current.owner as any).name}: only they or an admin can release it.`, entity: current.entity, current: current.current };
  }
  await prisma.ownership.updateMany({
    where: { entiteType: type, entiteId: id, releasedAt: null },
    data: { releasedAt: new Date(), releasedById: userId, releaseMotif: opts.reason ?? null },
  });
  await setOwnerColumn(type, id, null);
  return { released: true, entity: current.entity, previous_owner: current.current.owner };
}

/** Échéances passées : la propriété est libérée (cron). */
export async function expireOwnerships() {
  const due = await prisma.ownership.findMany({ where: { releasedAt: null, expiresAt: { lte: new Date() } } });
  for (const o of due) {
    await prisma.ownership.update({ where: { id: o.id }, data: { releasedAt: o.expiresAt, releaseMotif: 'Échéance atteinte' } });
    const ent = await loadEntity(o.entiteType as OwnedType, o.entiteId);
    if (ent?.legacyOwnerId === o.ownerId) await setOwnerColumn(o.entiteType as OwnedType, o.entiteId, null);
  }
  return due.length;
}

/** Fin de prise en charge d'un client par la règle d'inactivité (60 jours) : on ferme la période. */
export async function closeForInactivity(type: OwnedType, id: string) {
  await prisma.ownership.updateMany({ where: { entiteType: type, entiteId: id, releasedAt: null }, data: { releasedAt: new Date(), releaseMotif: 'Inactivité (60 jours)' } });
}

/**
 * Attribution faite depuis l'interface (prise en charge d'un client, réassignation d'un lead) :
 * on ferme la période en cours et on en ouvre une nouvelle, sans échéance. Ne fait jamais
 * échouer l'action d'origine.
 */
export async function recordAssignment(type: OwnedType, id: string, ownerId: string | null, byUserId?: string | null) {
  try {
    const open = await prisma.ownership.findFirst({ where: { entiteType: type, entiteId: id, releasedAt: null }, orderBy: { claimedAt: 'desc' } });
    if (open && open.ownerId === ownerId) return;
    await prisma.ownership.updateMany({
      where: { entiteType: type, entiteId: id, releasedAt: null },
      data: { releasedAt: new Date(), releasedById: byUserId ?? null, releaseMotif: ownerId ? "Réassigné dans l'interface" : "Libéré dans l'interface" },
    });
    if (ownerId) await prisma.ownership.create({ data: { entiteType: type, entiteId: id, ownerId, motif: "Assigné dans l'interface" } });
  } catch (err) {
    console.warn('[Propriété] enregistrement impossible :', (err as Error).message);
  }
}
