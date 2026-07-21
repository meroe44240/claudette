/**
 * Portail client — service métier.
 *
 * Auth par (mandat, email) + password hashé. JWT séparé du JWT interne
 * (audience "portal") scopé sur un mandat. Chaque action logue un
 * PortalEvent qui alimente le widget "Activité client" côté fiche mandat.
 */

import prisma from '../../lib/db.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { SignJWT, jwtVerify } from 'jose';
import { NotFoundError, ValidationError, ForbiddenError } from '../../lib/errors.js';
import type {
  PortalDecisionType,
  PortalEventType,
  StageCandidature,
} from '@prisma/client';

const portalSecret = new TextEncoder().encode(
  process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
);

export interface PortalJwtPayload {
  sub: string;         // portalAccessId
  mandatId: string;
  clientId: string;
  email: string;
  type: 'portal';
}

export async function generatePortalToken(payload: Omit<PortalJwtPayload, 'type'>): Promise<string> {
  return new SignJWT({ ...payload, type: 'portal' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('4h')
    .sign(portalSecret);
}

export async function verifyPortalToken(token: string): Promise<PortalJwtPayload> {
  const { payload } = await jwtVerify(token, portalSecret);
  const p = payload as unknown as PortalJwtPayload;
  if (p.type !== 'portal') throw new Error('Invalid token type');
  return p;
}

// ─── Access management (côté interne) ──────────────────────────

export async function createAccess(
  data: { mandatId: string; clientId: string; email: string; password: string },
) {
  const mandat = await prisma.mandat.findUnique({ where: { id: data.mandatId } });
  if (!mandat) throw new NotFoundError('Mandat', data.mandatId);
  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) throw new NotFoundError('Client', data.clientId);

  const existing = await prisma.portalAccess.findUnique({
    where: { mandatId_email: { mandatId: data.mandatId, email: data.email.toLowerCase().trim() } },
  });
  if (existing && !existing.revokedAt) {
    throw new ValidationError('Un accès actif existe déjà pour ce mandat + email');
  }

  const passwordHash = await hashPassword(data.password);
  return prisma.portalAccess.create({
    data: {
      mandatId: data.mandatId,
      clientId: data.clientId,
      email: data.email.toLowerCase().trim(),
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      mandatId: true,
      clientId: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });
}

export async function listAccessesForMandat(mandatId: string) {
  return prisma.portalAccess.findMany({
    where: { mandatId },
    select: {
      id: true,
      email: true,
      lastLoginAt: true,
      revokedAt: true,
      createdAt: true,
      client: { select: { id: true, nom: true, prenom: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeAccess(accessId: string) {
  return prisma.portalAccess.update({
    where: { id: accessId },
    data: { revokedAt: new Date() },
  });
}

// ─── Portal-side login + reads ────────────────────────────────

export async function login(email: string, password: string, mandatId: string) {
  const access = await prisma.portalAccess.findUnique({
    where: { mandatId_email: { mandatId, email: email.toLowerCase().trim() } },
  });
  if (!access || access.revokedAt) {
    throw new ForbiddenError('Identifiants invalides ou accès révoqué');
  }
  const ok = await verifyPassword(password, access.passwordHash);
  if (!ok) throw new ForbiddenError('Identifiants invalides');

  // Update last login + log event
  await prisma.$transaction([
    prisma.portalAccess.update({
      where: { id: access.id },
      data: { lastLoginAt: new Date() },
    }),
    prisma.portalEvent.create({
      data: {
        portalAccessId: access.id,
        mandatId,
        type: 'LOGIN' as PortalEventType,
        payload: { email },
      },
    }),
  ]);

  const token = await generatePortalToken({
    sub: access.id,
    mandatId: access.mandatId,
    clientId: access.clientId,
    email: access.email,
  });

  return {
    token,
    access: {
      id: access.id,
      mandatId: access.mandatId,
      email: access.email,
    },
  };
}

/**
 * Retourne le kanban en lecture pour un mandat, filtre par visibleStages
 * du mandat. Le portail voit uniquement les colonnes autorisées.
 */
export async function getKanban(mandatId: string) {
  const mandat = await prisma.mandat.findUnique({
    where: { id: mandatId },
    select: {
      id: true,
      titrePoste: true,
      visibleStages: true,
      entreprise: { select: { nom: true } },
      client: { select: { nom: true, prenom: true } },
    },
  });
  if (!mandat) throw new NotFoundError('Mandat', mandatId);

  const stages = (mandat.visibleStages as StageCandidature[]).filter((s) => s !== 'REFUSE');

  const candidatures = await prisma.candidature.findMany({
    where: { mandatId, stage: { in: stages } },
    select: {
      id: true,
      stage: true,
      dateEntretienClient: true,
      candidat: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          posteActuel: true,
          entrepriseActuelle: true,
          aiPitchShort: true,
          aiAnonymizedProfile: true,
        },
      },
      portalDecisions: {
        select: { decision: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Group by stage
  const byStage: Record<string, typeof candidatures> = {};
  for (const s of stages) byStage[s] = [];
  for (const c of candidatures) {
    if (byStage[c.stage]) byStage[c.stage].push(c);
  }

  return {
    mandat,
    stages,
    byStage,
  };
}

export async function recordDecision(
  data: { portalAccessId: string; mandatId: string; candidatureId: string; decision: PortalDecisionType; reason?: string },
) {
  const candidature = await prisma.candidature.findUnique({ where: { id: data.candidatureId } });
  if (!candidature || candidature.mandatId !== data.mandatId) {
    throw new NotFoundError('Candidature', data.candidatureId);
  }

  await prisma.$transaction([
    prisma.portalDecision.create({
      data: {
        portalAccessId: data.portalAccessId,
        candidatureId: data.candidatureId,
        decision: data.decision,
        reason: data.reason?.trim() || null,
      },
    }),
    prisma.portalEvent.create({
      data: {
        portalAccessId: data.portalAccessId,
        mandatId: data.mandatId,
        candidatureId: data.candidatureId,
        type: 'DECISION' as PortalEventType,
        payload: { decision: data.decision, reason: data.reason ?? null },
      },
    }),
  ]);

  return { ok: true };
}

export async function recordComment(
  data: { portalAccessId: string; mandatId: string; candidatureId?: string; content: string },
) {
  const content = data.content.trim();
  if (!content) throw new ValidationError('Le commentaire ne peut pas être vide');
  if (data.candidatureId) {
    const c = await prisma.candidature.findUnique({ where: { id: data.candidatureId } });
    if (!c || c.mandatId !== data.mandatId) throw new NotFoundError('Candidature', data.candidatureId);
  }

  await prisma.$transaction([
    prisma.portalComment.create({
      data: {
        portalAccessId: data.portalAccessId,
        mandatId: data.mandatId,
        candidatureId: data.candidatureId ?? null,
        content,
      },
    }),
    prisma.portalEvent.create({
      data: {
        portalAccessId: data.portalAccessId,
        mandatId: data.mandatId,
        candidatureId: data.candidatureId ?? null,
        type: 'COMMENT' as PortalEventType,
        payload: { preview: content.slice(0, 120) },
      },
    }),
  ]);

  return { ok: true };
}

export async function recordViewProfile(
  data: { portalAccessId: string; mandatId: string; candidatureId: string },
) {
  await prisma.portalEvent.create({
    data: {
      portalAccessId: data.portalAccessId,
      mandatId: data.mandatId,
      candidatureId: data.candidatureId,
      type: 'VIEW_PROFILE' as PortalEventType,
      payload: {},
    },
  });
  return { ok: true };
}

// ─── Alimente le widget "Activité client" côté fiche mandat ────

export async function listRecentEventsForMandat(mandatId: string, limit = 20) {
  return prisma.portalEvent.findMany({
    where: { mandatId },
    select: {
      id: true,
      type: true,
      candidatureId: true,
      payload: true,
      createdAt: true,
      portalAccess: { select: { email: true, client: { select: { nom: true, prenom: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
