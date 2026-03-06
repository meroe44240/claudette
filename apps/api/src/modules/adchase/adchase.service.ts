import prisma from '../../lib/db.js';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../lib/errors.js';

// ─── TYPES ──────────────────────────────────────────

export interface CreateCampaignInput {
  candidatId: string;
  anonymizedProfile: Record<string, unknown>;
  anonymizedCvUrl?: string;
  emailSubject: string;
  emailBody: string;
  prospectClientIds: string[];
  sequenceId?: string;
  userId: string;
}

export interface UpdateCampaignInput {
  anonymizedProfile?: Record<string, unknown>;
  anonymizedCvUrl?: string;
  emailSubject?: string;
  emailBody?: string;
  sequenceId?: string;
  scheduledAt?: string;
}

// ─── CREATE CAMPAIGN ────────────────────────────────

export async function createCampaign(data: CreateCampaignInput) {
  // Verify candidat exists
  const candidat = await prisma.candidat.findUnique({ where: { id: data.candidatId } });
  if (!candidat) throw new NotFoundError('Candidat', data.candidatId);

  // Verify all client IDs exist
  if (data.prospectClientIds.length === 0) {
    throw new ValidationError('Au moins un prospect est requis');
  }

  const clients = await prisma.client.findMany({
    where: { id: { in: data.prospectClientIds } },
    select: { id: true },
  });

  if (clients.length !== data.prospectClientIds.length) {
    throw new ValidationError('Certains clients sélectionnés sont introuvables');
  }

  // Create campaign with prospects
  const campaign = await prisma.adchaseCampaign.create({
    data: {
      candidatId: data.candidatId,
      anonymizedProfile: data.anonymizedProfile as Prisma.InputJsonValue,
      anonymizedCvUrl: data.anonymizedCvUrl,
      emailSubject: data.emailSubject,
      emailBody: data.emailBody,
      sequenceId: data.sequenceId,
      totalProspects: data.prospectClientIds.length,
      status: 'draft',
      createdById: data.userId,
      prospects: {
        create: data.prospectClientIds.map((clientId) => ({
          clientId,
          emailStatus: 'pending',
        })),
      },
    },
    include: {
      prospects: true,
    },
  });

  return campaign;
}

// ─── LIST CAMPAIGNS ─────────────────────────────────

export async function getCampaigns(userId?: string) {
  const campaigns = await prisma.adchaseCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      prospects: {
        select: {
          id: true,
          emailStatus: true,
          replySentiment: true,
        },
      },
    },
  });

  // Group by status
  const grouped = {
    draft: campaigns.filter((c) => c.status === 'draft'),
    active: campaigns.filter((c) => ['scheduled', 'sending', 'active'].includes(c.status)),
    completed: campaigns.filter((c) => c.status === 'completed'),
  };

  // Enrich with candidat names
  const candidatIds = [...new Set(campaigns.map((c) => c.candidatId))];
  const candidats = await prisma.candidat.findMany({
    where: { id: { in: candidatIds } },
    select: { id: true, nom: true, prenom: true, posteActuel: true, localisation: true },
  });
  const candidatMap = new Map(candidats.map((c) => [c.id, c]));

  const enrichCampaign = (c: typeof campaigns[0]) => {
    const candidat = candidatMap.get(c.candidatId);
    const stats = {
      total: c.prospects.length,
      sent: c.prospects.filter((p) => p.emailStatus !== 'pending').length,
      opened: c.prospects.filter((p) => p.emailStatus === 'opened' || p.emailStatus === 'replied').length,
      replied: c.prospects.filter((p) => p.emailStatus === 'replied').length,
      interested: c.prospects.filter((p) => p.replySentiment === 'interested').length,
    };

    return {
      ...c,
      candidatName: candidat ? `${candidat.prenom || ''} ${candidat.nom}`.trim() : 'Inconnu',
      candidatPoste: candidat?.posteActuel,
      stats,
    };
  };

  return {
    draft: grouped.draft.map(enrichCampaign),
    active: grouped.active.map(enrichCampaign),
    completed: grouped.completed.map(enrichCampaign),
  };
}

// ─── GET CAMPAIGN BY ID ─────────────────────────────

export async function getCampaignById(id: string) {
  const campaign = await prisma.adchaseCampaign.findUnique({
    where: { id },
    include: {
      prospects: true,
    },
  });

  if (!campaign) throw new NotFoundError('Campagne Adchase', id);

  // Get candidat info
  const candidat = await prisma.candidat.findUnique({
    where: { id: campaign.candidatId },
    select: { id: true, nom: true, prenom: true, posteActuel: true, entrepriseActuelle: true, localisation: true },
  });

  // Get client details for each prospect
  const clientIds = campaign.prospects.map((p) => p.clientId);
  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    include: {
      entreprise: { select: { nom: true, secteur: true, localisation: true } },
    },
  });
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  const prospectsWithClients = campaign.prospects.map((p) => ({
    ...p,
    client: clientMap.get(p.clientId) || null,
  }));

  return {
    ...campaign,
    candidat,
    prospects: prospectsWithClients,
  };
}

// ─── UPDATE CAMPAIGN ────────────────────────────────

export async function updateCampaign(id: string, data: UpdateCampaignInput) {
  const existing = await prisma.adchaseCampaign.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Campagne Adchase', id);

  if (existing.status !== 'draft') {
    throw new ValidationError('Seules les campagnes en brouillon peuvent être modifiées');
  }

  return prisma.adchaseCampaign.update({
    where: { id },
    data: {
      anonymizedProfile: data.anonymizedProfile as Prisma.InputJsonValue,
      anonymizedCvUrl: data.anonymizedCvUrl,
      emailSubject: data.emailSubject,
      emailBody: data.emailBody,
      sequenceId: data.sequenceId,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
    },
    include: {
      prospects: true,
    },
  });
}

// ─── LAUNCH CAMPAIGN ────────────────────────────────

export async function launchCampaign(id: string, userId: string) {
  const campaign = await prisma.adchaseCampaign.findUnique({
    where: { id },
    include: { prospects: true },
  });

  if (!campaign) throw new NotFoundError('Campagne Adchase', id);

  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    throw new ValidationError('Cette campagne ne peut pas être lancée');
  }

  // Update campaign status
  const updated = await prisma.adchaseCampaign.update({
    where: { id },
    data: {
      status: 'active',
      sentAt: new Date(),
    },
  });

  // Mark all prospects as sent
  await prisma.adchaseProspect.updateMany({
    where: { campaignId: id },
    data: {
      emailStatus: 'sent',
      sentAt: new Date(),
    },
  });

  // Create activity logs for each prospect
  const clientIds = campaign.prospects.map((p) => p.clientId);
  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: { id: true, nom: true, prenom: true },
  });
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  // Get candidat name for logs
  const candidat = await prisma.candidat.findUnique({
    where: { id: campaign.candidatId },
    select: { nom: true, prenom: true },
  });
  const candidatName = candidat ? `${candidat.prenom || ''} ${candidat.nom}`.trim() : 'Candidat';

  for (const prospect of campaign.prospects) {
    const client = clientMap.get(prospect.clientId);
    const clientName = client ? `${client.prenom || ''} ${client.nom}`.trim() : 'Client';

    await prisma.activite.create({
      data: {
        type: 'EMAIL',
        direction: 'SORTANT',
        entiteType: 'CLIENT',
        entiteId: prospect.clientId,
        userId,
        titre: `Adchase — Profil anonymisé envoyé à ${clientName}`,
        contenu: `Campagne Adchase : profil anonymisé de ${candidatName} envoyé.\nObjet: ${campaign.emailSubject}`,
        source: 'SYSTEME',
        metadata: {
          adchaseCampaignId: campaign.id,
          adchaseProspectId: prospect.id,
          candidatId: campaign.candidatId,
        },
      },
    });
  }

  return updated;
}

// ─── GET CANDIDAT FOR ADCHASE ───────────────────────

export async function getCandidatForAdchase(candidatId: string) {
  const candidat = await prisma.candidat.findUnique({
    where: { id: candidatId },
    select: {
      id: true,
      nom: true,
      prenom: true,
      email: true,
      telephone: true,
      posteActuel: true,
      entrepriseActuelle: true,
      localisation: true,
      salaireActuel: true,
      salaireSouhaite: true,
      disponibilite: true,
      tags: true,
      cvUrl: true,
      cvTexte: true,
    },
  });

  if (!candidat) throw new NotFoundError('Candidat', candidatId);

  return candidat;
}

// ─── GET PROSPECTS WITH STATUS ──────────────────────

export async function getProspectsWithStatus(campaignId: string) {
  const campaign = await prisma.adchaseCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) throw new NotFoundError('Campagne Adchase', campaignId);

  const prospects = await prisma.adchaseProspect.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  });

  // Get client details
  const clientIds = prospects.map((p) => p.clientId);
  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    include: {
      entreprise: { select: { nom: true, secteur: true, localisation: true } },
    },
  });
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  return prospects.map((p) => ({
    ...p,
    client: clientMap.get(p.clientId) || null,
  }));
}
