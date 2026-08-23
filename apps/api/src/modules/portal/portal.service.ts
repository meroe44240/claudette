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
import { sendEmail } from '../../lib/mailer.js';

const PORTAL_BASE = process.env.PORTAL_BASE_URL || 'https://ats.propium.co';
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
  data: { mandatId: string; clientId: string; email: string; password: string; sendInvite?: boolean; contactName?: string },
) {
  const mandat = await prisma.mandat.findUnique({
    where: { id: data.mandatId },
    select: { id: true, titrePoste: true, visibleStages: true },
  });
  if (!mandat) throw new NotFoundError('Mandat', data.mandatId);
  const client = await prisma.client.findUnique({ where: { id: data.clientId } });
  if (!client) throw new NotFoundError('Client', data.clientId);

  const email = data.email.toLowerCase().trim();
  const existing = await prisma.portalAccess.findUnique({
    where: { mandatId_email: { mandatId: data.mandatId, email } },
  });
  if (existing && !existing.revokedAt) {
    throw new ValidationError('Un accès actif existe déjà pour ce mandat + email');
  }

  const passwordHash = await hashPassword(data.password);
  const access = await prisma.portalAccess.create({
    data: { mandatId: data.mandatId, clientId: data.clientId, email, passwordHash },
    select: { id: true, email: true, mandatId: true, clientId: true, createdAt: true, lastLoginAt: true },
  });

  // Email d'invitation (lien + identifiants) — envoyé seulement si demandé.
  if (data.sendInvite) {
    const nbVisible = await prisma.candidature.count({
      where: { mandatId: data.mandatId, stage: { in: (mandat.visibleStages as StageCandidature[]).filter((s) => s !== 'REFUSE') } },
    });
    try {
      await sendInviteEmail({
        email, password: data.password, mandatId: data.mandatId,
        titrePoste: mandat.titrePoste, contactName: data.contactName, nbVisible,
      });
    } catch (err) {
      console.error('[Portal] invite email failed:', err);
    }
  }
  return access;
}

async function sendInviteEmail(p: { email: string; password: string; mandatId: string; titrePoste: string; contactName?: string; nbVisible: number }) {
  const link = `${PORTAL_BASE}/portail/login?m=${p.mandatId}`;
  const prenom = (p.contactName || '').trim().split(/\s+/)[0] || '';
  const hello = prenom ? `Bonjour ${prenom},` : 'Bonjour,';
  const profils = p.nbVisible > 0
    ? `${p.nbVisible} profil${p.nbVisible > 1 ? 's' : ''} vous ${p.nbVisible > 1 ? 'attendent' : 'attend'} déjà.`
    : 'Les profils présentés y apparaîtront au fil de l’avancement.';
  const subject = `Votre espace de suivi — ${p.titrePoste}`;
  const text = `${hello}\n\nVoici votre espace de suivi pour le recrutement « ${p.titrePoste} ». Vous y consultez les profils présentés et donnez votre avis en un clic (rencontrer, à discuter, écarter).\n\n${profils}\n\nAccès : ${link}\nIdentifiant : ${p.email}\nMot de passe : ${p.password}\n\nBien à vous,\nL’équipe HumanUp`;

  const F = 'Arial,Helvetica,sans-serif';
  const html = `<div style="background:#ECECE4;padding:24px 12px;font-family:${F}">
    <div style="max-width:560px;margin:0 auto;background:#FCFCF5;border-radius:18px;overflow:hidden;box-shadow:0 26px 64px -38px rgba(20,16,58,.5)">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#22177A"><tr><td style="padding:22px 26px">
        <img src="${PORTAL_BASE}/brand/logo-mark-cream.png" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0" />
        <span style="font-family:${F};font-size:15px;font-weight:bold;letter-spacing:.5px;color:#E6E9AF;margin-left:10px;vertical-align:middle">HUMANUP</span>
      </td></tr></table>
      <div style="height:3px;background:#E6E9AF;font-size:0;line-height:0">&nbsp;</div>
      <div style="padding:26px 28px">
        <div style="font-family:${F};font-size:18px;font-weight:bold;color:#1A1533">${hello}</div>
        <p style="font-family:${F};font-size:14px;line-height:1.6;color:#4A4568;margin:12px 0">Voici votre espace de suivi pour le recrutement <strong>${p.titrePoste}</strong>. Vous y consultez les profils présentés et donnez votre avis en un clic : <strong>rencontrer</strong>, <strong>à discuter</strong> ou <strong>écarter</strong>.</p>
        <p style="font-family:${F};font-size:14px;line-height:1.6;color:#22177A;font-weight:bold;margin:0 0 18px">${profils}</p>
        <a href="${link}" style="display:inline-block;background:#22177A;color:#E6E9AF;font-family:${F};font-size:15px;font-weight:bold;text-decoration:none;border-radius:12px;padding:13px 22px">Accéder à mon espace</a>
        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;background:#F2F3D8;border-radius:12px"><tr><td style="padding:14px 16px">
          <div style="font-family:${F};font-size:9.5px;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;color:#8A6A2E">Vos identifiants</div>
          <div style="font-family:${F};font-size:13.5px;color:#1A1533;margin-top:6px">Identifiant : <strong>${p.email}</strong></div>
          <div style="font-family:${F};font-size:13.5px;color:#1A1533;margin-top:3px">Mot de passe : <strong style="font-family:monospace">${p.password}</strong></div>
        </td></tr></table>
      </div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#22177A"><tr><td style="padding:16px 26px;text-align:center">
        <div style="font-family:${F};font-size:11px;font-weight:bold;letter-spacing:1.6px;text-transform:uppercase;color:#E6E9AF">humanup.io</div>
      </td></tr></table>
    </div></div>`;

  await sendEmail(p.email, subject, html, text);
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
