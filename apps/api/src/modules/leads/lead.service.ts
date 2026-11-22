import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';

// Stages valides du pipeline lead (prospection à relances)
export const LEAD_STAGES = [
  'nouveau', 'contacte', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'rdv', 'gagne', 'perdu',
] as const;

export interface CreateLeadInput {
  company: string;
  contact: string;
  role?: string | null;
  city?: string | null;
  sector?: string | null;
  headcount?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  src?: string;
  stage?: string;
  ownerId?: string | null;
  entrepriseId?: string | null;
  pushedCandidat?: unknown;
  nbPostes?: number | null;
  packageMoyen?: number | null;
}

/** Taux d'honoraires retenu pour la valeur d'opportunité d'un lead. */
export const OPPORTUNITY_FEE_RATE = 0.22;

/** Valeur d'opportunité = postes × package moyen × 22 %, ou null si une des deux données manque. */
export function opportunityValue(l: { nbPostes?: number | null; packageMoyen?: number | null }): number | null {
  if (!l.nbPostes || !l.packageMoyen) return null;
  return Math.round(l.nbPostes * l.packageMoyen * OPPORTUNITY_FEE_RATE);
}

function withValue<T extends { nbPostes?: number | null; packageMoyen?: number | null }>(l: T) {
  return { ...l, valeurOpportunite: opportunityValue(l) };
}

const leadInclude = {
  interactions: { orderBy: { createdAt: 'desc' as const }, take: 20 },
  _count: { select: { interactions: true } },
};

export async function listLeads(ownerId?: string) {
  const rows = await prisma.lead.findMany({
    where: ownerId ? { ownerId } : undefined,
    include: leadInclude,
    orderBy: { lastContactAt: { sort: 'desc', nulls: 'last' } },
  });
  return rows.map(withValue);
}

export async function getLead(id: string) {
  const lead = await prisma.lead.findUnique({ where: { id }, include: leadInclude });
  if (!lead) throw new NotFoundError('Lead', id);
  return withValue(lead);
}

export async function createLead(data: CreateLeadInput, ownerId?: string) {
  const lead = await prisma.lead.create({
    data: {
      company: data.company,
      contact: data.contact,
      role: data.role ?? null,
      city: data.city ?? null,
      sector: data.sector ?? null,
      headcount: data.headcount ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      source: data.source ?? null,
      src: data.src ?? 'cold',
      stage: data.stage ?? 'nouveau',
      ownerId: data.ownerId ?? ownerId ?? null,
      entrepriseId: data.entrepriseId ?? null,
      pushedCandidat: (data.pushedCandidat as any) ?? undefined,
      nbPostes: data.nbPostes ?? null,
      packageMoyen: data.packageMoyen ?? null,
      lastContactAt: new Date(),
    },
    include: leadInclude,
  });
  return withValue(lead);
}

export async function updateLead(id: string, data: Partial<CreateLeadInput> & { lostReason?: string | null; lostNote?: string | null }, byUserId?: string) {
  const before = await getLead(id);
  if (data.ownerId !== undefined && data.ownerId !== before.ownerId) {
    const { recordAssignment } = await import('../ownership/ownership.service.js');
    await recordAssignment('LEAD', id, data.ownerId ?? null, byUserId);
  }
  return prisma.lead.update({
    where: { id },
    data: {
      ...(data.stage !== undefined ? { stage: data.stage } : {}),
      ...(data.company !== undefined ? { company: data.company } : {}),
      ...(data.contact !== undefined ? { contact: data.contact } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
      ...(data.nbPostes !== undefined ? { nbPostes: data.nbPostes } : {}),
      ...(data.packageMoyen !== undefined ? { packageMoyen: data.packageMoyen } : {}),
    },
    include: leadInclude,
  }).then(withValue);
}

export async function loseLead(id: string, lostReason: string, lostNote?: string) {
  await getLead(id);
  return prisma.lead.update({
    where: { id },
    data: { stage: 'perdu', lostReason, lostNote: lostNote ?? null },
    include: leadInclude,
  });
}

export async function addInteraction(leadId: string, type: string | null, text: string, createdById?: string) {
  await getLead(leadId);
  const interaction = await prisma.$transaction(async (tx) => {
    const created = await tx.leadInteraction.create({ data: { leadId, type, text, createdById: createdById ?? null } });
    await tx.lead.update({ where: { id: leadId }, data: { lastContactAt: new Date() } });
    return created;
  });
  return interaction;
}

// Convertit un lead en Client (funnel /clients/pipeline). Crée l'Entreprise si besoin.
export async function convertLead(id: string, userId?: string) {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) throw new NotFoundError('Lead', id);
  if (lead.clientId) {
    const existing = await prisma.client.findUnique({ where: { id: lead.clientId } });
    return { client: existing, alreadyConverted: true };
  }

  let entrepriseId = lead.entrepriseId;
  if (!entrepriseId) {
    const existingEnt = await prisma.entreprise.findFirst({ where: { nom: lead.company } });
    const entreprise = existingEnt ?? (await prisma.entreprise.create({
      data: { nom: lead.company, localisation: lead.city ?? undefined, secteur: lead.sector ?? undefined },
    }));
    entrepriseId = entreprise.id;
  }

  const parts = lead.contact.trim().split(/\s+/);
  const prenom = parts.length > 1 ? parts[0] : null;
  const nom = parts.length > 1 ? parts.slice(1).join(' ') : lead.contact;

  const client = await prisma.client.create({
    data: {
      nom,
      prenom,
      email: lead.email,
      telephone: lead.phone,
      poste: lead.role,
      entrepriseId: entrepriseId!,
      statutClient: 'LEAD',
      createdById: userId ?? null,
      assignedToId: lead.ownerId ?? userId ?? null,
    },
  });

  await prisma.lead.update({ where: { id }, data: { clientId: client.id, stage: 'gagne', entrepriseId } });
  return { client, alreadyConverted: false };
}

export async function removeLead(id: string) {
  await getLead(id);
  await prisma.lead.delete({ where: { id } });
  return { ok: true };
}
