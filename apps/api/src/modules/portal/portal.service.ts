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
import { sendEmail, renderBrandedEmail } from '../../lib/mailer.js';
import * as candidatureService from '../candidatures/candidature.service.js';

const PORTAL_BASE = process.env.PORTAL_BASE_URL || 'https://ats.propium.co';
import type {
  PortalDecisionType,
  PortalEventType,
  StageCandidature,
} from '@prisma/client';

// Étapes montrables au client, dans l'ordre du portail :
// Screening / Case / Culture Fit / Offre / Engagé / Perdu.
const PORTAL_STAGE_ORDER: StageCandidature[] = ['ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'PROCESS', 'OFFRE', 'PLACE', 'REFUSE'];
const PORTAL_STAGE_LABEL: Record<string, string> = {
  ENVOYE_CLIENT: 'Screening', ENTRETIEN_CLIENT: 'Case', PROCESS: 'Culture Fit', OFFRE: 'Offre', PLACE: 'Engagé', REFUSE: 'Perdu',
};

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
    .setExpirationTime('8h')
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
    data: { mandatId: data.mandatId, clientId: data.clientId, email, passwordHash, name: data.contactName?.trim() || null },
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
export async function getKanban(mandatId: string, portalAccessId?: string) {
  const mandat = await prisma.mandat.findUnique({
    where: { id: mandatId },
    select: {
      id: true,
      titrePoste: true,
      visibleStages: true,
      entreprise: { select: { nom: true } },
      client: { select: { nom: true, prenom: true } },
      recruteur: { select: { id: true, nom: true, prenom: true, avatarUrl: true } },
      assignedTo: { select: { id: true, nom: true, prenom: true, avatarUrl: true } },
      sales: { select: { id: true, nom: true, prenom: true, avatarUrl: true } },
    },
  });
  if (!mandat) throw new NotFoundError('Mandat', mandatId);

  // Colonnes dans l'ordre du pipeline, quel que soit l'ordre stocké.
  const visible = mandat.visibleStages as StageCandidature[];
  const stages = PORTAL_STAGE_ORDER.filter((s) => visible.includes(s));
  const activeStages = stages.filter((s) => s !== 'REFUSE');
  const sentStages = PORTAL_STAGE_ORDER.filter((s) => s !== 'REFUSE');

  const candidatures = await prisma.candidature.findMany({
    where: {
      mandatId,
      OR: [
        { stage: { in: activeStages } },
        // « Perdu » : seulement les profils que le client a déjà vus
        // (jamais les refus internes au sourcing / à la qualification).
        ...(stages.includes('REFUSE')
          ? [{
              stage: 'REFUSE' as StageCandidature,
              OR: [
                { datePresentation: { not: null } },
                { stageHistory: { some: { toStage: { in: sentStages } } } },
                { portalDecisions: { some: {} } },
              ],
            }]
          : []),
      ],
    },
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
          salaireSouhaite: true,
          photoUrl: true,
          aiPitchShort: true,
          aiAnonymizedProfile: true,
        },
      },
      portalDecisions: {
        select: { decision: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      _count: { select: { portalComments: true } },
      stageHistory: { select: { changedAt: true }, orderBy: { changedAt: 'desc' }, take: 1 },
      createdAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Profils déjà ouverts par ce contact (badge « Nouveau » sinon).
  const ids = candidatures.map((c) => c.id);
  const [views, hires] = await Promise.all([
    portalAccessId
      ? prisma.portalEvent.findMany({ where: { portalAccessId, type: 'VIEW_PROFILE' as PortalEventType, candidatureId: { in: ids } }, select: { candidatureId: true }, distinct: ['candidatureId'] })
      : Promise.resolve([] as Array<{ candidatureId: string | null }>),
    openHireTasks(mandatId),
  ]);
  const seen = new Set(views.map((v) => v.candidatureId));
  const hired = new Set(hires);

  // Group by stage
  const byStage: Record<string, Array<Omit<(typeof candidatures)[number], 'stageHistory' | 'createdAt'> & { seen: boolean; stageSince: Date; hireAnnounced: boolean }>> = {};
  for (const s of stages) byStage[s] = [];
  for (const c of candidatures) {
    const { stageHistory, createdAt, ...rest } = c;
    if (byStage[c.stage]) byStage[c.stage].push({ ...rest, seen: seen.has(c.id), stageSince: stageHistory[0]?.changedAt ?? createdAt, hireAnnounced: hired.has(c.id) && c.stage !== 'PLACE' });
  }

  const { recruteur, assignedTo, sales, ...mandatPublic } = mandat;

  return {
    mandat: { ...mandatPublic, ...humanupContacts({ recruteur, sales, assignedTo }) },
    stages,
    byStage,
  };
}

// Interlocuteurs HumanUp affichés au client : consultant (recruteur) et commercial
// (sales, sinon le responsable du mandat s'il n'est pas déjà le consultant).
type Person = { id: string; nom: string; prenom: string | null; avatarUrl?: string | null } | null;
function humanupContacts(m: { recruteur: Person; sales: Person; assignedTo: Person }) {
  const consultant = m.recruteur ?? m.assignedTo;
  const commercial = m.sales ?? (m.assignedTo && m.assignedTo.id !== consultant?.id ? m.assignedTo : null);
  const pub = (u: Person) => (u ? { nom: u.nom, prenom: u.prenom, avatarUrl: u.avatarUrl ?? null } : null);
  return { consultant: pub(consultant), commercial: commercial && commercial.id !== consultant?.id ? pub(commercial) : null };
}
const fullNameOf = (u: { nom: string; prenom: string | null } | null) => (u ? `${u.prenom ? u.prenom + ' ' : ''}${u.nom}`.trim() : null);

// Candidatures dont l'embauche a été annoncée par le client et pas encore validée.
async function openHireTasks(mandatId: string): Promise<string[]> {
  const rows = await prisma.activite.findMany({
    where: {
      isTache: true, tacheCompleted: false,
      AND: [{ metadata: { path: ['mandatId'], equals: mandatId } }, { metadata: { path: ['to'], equals: 'PLACE' } }, { metadata: { path: ['portal'], equals: true } }],
    },
    select: { metadata: true },
  });
  return rows.map((r) => (r.metadata as any)?.candidatureId).filter(Boolean);
}

// Mot de passe oublié : régénère un mot de passe et l'envoie à l'adresse de l'accès.
// Réponse identique que l'accès existe ou non (pas d'énumération).
export async function resetPassword(mandatId: string, emailRaw: string) {
  const email = emailRaw.toLowerCase().trim();
  const access = await prisma.portalAccess.findUnique({
    where: { mandatId_email: { mandatId, email } },
    select: { id: true, name: true, revokedAt: true, mandat: { select: { titrePoste: true } } },
  });
  if (!access || access.revokedAt) return { ok: true };
  const password = Array.from({ length: 12 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 56)]).join('');
  await prisma.portalAccess.update({ where: { id: access.id }, data: { passwordHash: await hashPassword(password) } });
  const link = `${PORTAL_BASE}/portail/login?m=${mandatId}`;
  const prenom = (access.name || '').trim().split(/\s+/)[0];
  await sendEmail(email, `Votre nouveau mot de passe — ${access.mandat.titrePoste}`, renderBrandedEmail({
    title: 'Nouveau mot de passe',
    bodyHtml: `<p>Bonjour${prenom ? ' ' + esc(prenom) : ''},</p><p>Voici votre nouveau mot de passe pour l’espace de suivi <strong>${esc(access.mandat.titrePoste)}</strong> :</p>
      <p style="font-family:monospace;font-size:16px;background:#F2F3D8;border-radius:10px;padding:12px 14px;display:inline-block">${password}</p>
      <p>Identifiant : <strong>${esc(email)}</strong></p><p>Si vous n’êtes pas à l’origine de cette demande, prévenez votre consultant HumanUp.</p>`,
    cta: { label: 'Me connecter', href: link },
    signature: 'L’équipe HumanUp',
  }));
  return { ok: true };
}

// Contexte public de la page de connexion (poste + consultant), par l'id du lien.
export async function publicMandatInfo(mandatId: string) {
  const m = await prisma.mandat.findUnique({
    where: { id: mandatId },
    select: {
      titrePoste: true, entreprise: { select: { nom: true } },
      recruteur: { select: { id: true, prenom: true, nom: true, avatarUrl: true } }, assignedTo: { select: { id: true, prenom: true, nom: true, avatarUrl: true } }, sales: { select: { id: true, prenom: true, nom: true, avatarUrl: true } },
    },
  });
  if (!m) throw new NotFoundError('Mandat', mandatId);
  const { consultant, commercial } = humanupContacts(m);
  return {
    titrePoste: m.titrePoste, entreprise: m.entreprise?.nom ?? null,
    consultant: fullNameOf(consultant), consultantPhoto: consultant?.avatarUrl ?? null,
    commercial: fullNameOf(commercial), commercialPhoto: commercial?.avatarUrl ?? null,
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

// Mention dans un commentaire : quelqu'un de l'équipe HumanUp (userId) ou
// une personne externe (email), côté client en général.
export type PortalMention =
  | { kind: 'internal'; id: string }
  | { kind: 'external'; email: string; name?: string };

export async function recordComment(
  data: { portalAccessId: string; mandatId: string; candidatureId?: string; content: string; mentions?: PortalMention[] },
) {
  const content = data.content.trim();
  if (!content) throw new ValidationError('Le commentaire ne peut pas être vide');
  let candidat: { id: string; prenom: string | null; nom: string } | null = null;
  if (data.candidatureId) {
    const c = await prisma.candidature.findUnique({
      where: { id: data.candidatureId },
      select: { mandatId: true, candidat: { select: { id: true, prenom: true, nom: true } } },
    });
    if (!c || c.mandatId !== data.mandatId) throw new NotFoundError('Candidature', data.candidatureId);
    candidat = c.candidat;
  }

  // On ne garde que les mentions internes de l'équipe du mandat, et des emails valides.
  const { internal, external: knownExternal } = await getMentionables(data.mandatId);
  const byId = new Map(internal.map((u) => [u.id, u]));
  const resolved: Array<{ kind: 'internal' | 'external'; id?: string; email: string; name: string }> = [];
  for (const m of (data.mentions ?? []).slice(0, 10)) {
    if (m.kind === 'internal') {
      const u = byId.get(m.id);
      if (u && !resolved.some((r) => r.id === u.id)) resolved.push({ kind: 'internal', id: u.id, email: u.email, name: u.name });
    } else {
      const email = m.email.toLowerCase().trim();
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !resolved.some((r) => r.email === email)) {
        resolved.push({ kind: 'external', email, name: (m.name || '').trim() || email });
      }
    }
  }

  // Adresses hors des contacts connus : au plus 5 nouvelles par jour et par accès (anti-abus du mailer).
  const known = new Set(knownExternal.map((k) => k.email));
  const unknown = resolved.filter((r) => r.kind === 'external' && !known.has(r.email));
  if (unknown.length > 0) {
    const recent = await prisma.portalComment.findMany({
      where: { portalAccessId: data.portalAccessId, createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } },
      select: { mentions: true },
    });
    const already = new Set<string>();
    for (const r of recent) for (const m of (Array.isArray(r.mentions) ? r.mentions : []) as any[]) if (m?.kind === 'external' && !known.has(m.email)) already.add(m.email);
    const fresh = unknown.filter((u) => !already.has(u.email));
    if (already.size + fresh.length > 5) {
      throw new ValidationError('Limite atteinte : 5 nouvelles adresses par jour. Demandez à votre consultant HumanUp d’ajouter ce contact.');
    }
  }

  const [comment] = await prisma.$transaction([
    prisma.portalComment.create({
      data: {
        portalAccessId: data.portalAccessId,
        mandatId: data.mandatId,
        candidatureId: data.candidatureId ?? null,
        content,
        mentions: resolved,
      },
      select: { id: true },
    }),
    prisma.portalEvent.create({
      data: {
        portalAccessId: data.portalAccessId,
        mandatId: data.mandatId,
        candidatureId: data.candidatureId ?? null,
        type: 'COMMENT' as PortalEventType,
        payload: { preview: content.slice(0, 120), mentions: resolved.map((r) => r.name) },
      },
    }),
  ]);

  if (resolved.length > 0) {
    void notifyMentions({ mandatId: data.mandatId, portalAccessId: data.portalAccessId, candidat, content, mentions: resolved })
      .catch((e) => console.error('[Portal] notif mentions échouée', e));
  }

  return { ok: true, id: comment.id };
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function notifyMentions(p: {
  mandatId: string; portalAccessId: string;
  candidat: { id: string; prenom: string | null; nom: string } | null;
  content: string;
  mentions: Array<{ kind: 'internal' | 'external'; email: string; name: string }>;
}) {
  const [mandat, access] = await Promise.all([
    prisma.mandat.findUnique({ where: { id: p.mandatId }, select: { titrePoste: true, entreprise: { select: { nom: true } } } }),
    prisma.portalAccess.findUnique({ where: { id: p.portalAccessId }, select: { email: true, name: true, client: { select: { nom: true, prenom: true, email: true } } } }),
  ]);
  const auteur = access ? portalAuthorName(access) : 'Votre client';
  const candidatNom = p.candidat ? `${p.candidat.prenom ?? ''} ${p.candidat.nom}`.trim() : null;
  const sujet = `${auteur} vous a mentionné${candidatNom ? ` — ${candidatNom}` : ''} · ${mandat?.titrePoste ?? ''}`;
  const quote = `<p style="border-left:3px solid #E6E9AF;padding-left:12px;margin:16px 0;color:#4a4568;">${esc(p.content).replace(/\n/g, '<br>')}</p>`;
  for (const m of p.mentions) {
    const internal = m.kind === 'internal';
    const href = internal && p.candidat
      ? `${PORTAL_BASE}/candidats/${p.candidat.id}`
      : `${PORTAL_BASE}/portail/login?m=${p.mandatId}`;
    const body = `<p>Bonjour ${esc(m.name.split(/\s+/)[0] || '')},</p>
      <p><strong>${esc(auteur)}</strong> vous a mentionné dans un commentaire sur le recrutement <strong>${esc(mandat?.titrePoste ?? '')}</strong>${mandat?.entreprise?.nom ? ` (${esc(mandat.entreprise.nom)})` : ''}${candidatNom ? `, à propos de <strong>${esc(candidatNom)}</strong>` : ''} :</p>${quote}`;
    try {
      await sendEmail(m.email, sujet, renderBrandedEmail({
        title: 'Nouvelle mention',
        bodyHtml: body,
        cta: { label: internal ? 'Ouvrir la fiche candidat' : 'Ouvrir l’espace de suivi', href },
        signature: 'L’équipe HumanUp',
      }));
    } catch (e) {
      console.error(`[Portal] email mention ${m.email} échoué`, e);
    }
  }
}

function portalAuthorName(a: { email: string; name?: string | null; client: { nom: string; prenom: string | null; email?: string | null } | null }) {
  if (a.name?.trim()) return a.name.trim();
  if (a.client && a.client.email?.toLowerCase() === a.email.toLowerCase()) {
    return `${a.client.prenom ? a.client.prenom + ' ' : ''}${a.client.nom}`.trim();
  }
  return a.email;
}

// Fil de commentaires d'un candidat (tous les accès portail du mandat).
export async function listComments(mandatId: string, candidatureId: string) {
  const rows = await prisma.portalComment.findMany({
    where: { mandatId, candidatureId },
    select: {
      id: true, content: true, createdAt: true, mentions: true,
      portalAccess: { select: { email: true, name: true, client: { select: { nom: true, prenom: true, email: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    createdAt: r.createdAt,
    mentions: r.mentions,
    author: portalAuthorName(r.portalAccess),
  }));
}

// Personnes mentionnables : l'équipe HumanUp du mandat + les contacts connus côté client.
export async function getMentionables(mandatId: string) {
  const userSel = { select: { id: true, nom: true, prenom: true, email: true, status: true, avatarUrl: true } } as const;
  const mandat = await prisma.mandat.findUnique({
    where: { id: mandatId },
    select: {
      entrepriseId: true,
      recruteur: userSel, sales: userSel, sourceur: userSel, assignedTo: userSel, createdBy: userSel,
      portalAccesses: { where: { revokedAt: null }, select: { email: true, name: true, client: { select: { nom: true, prenom: true, email: true } } } },
    },
  });
  if (!mandat) throw new NotFoundError('Mandat', mandatId);

  type U = { id: string; nom: string; prenom: string | null; email: string; status: string; avatarUrl: string | null } | null;
  const internal: Array<{ id: string; name: string; email: string; role: string; avatarUrl: string | null }> = [];
  const roles: Array<[U, string]> = [
    [mandat.recruteur, 'Consultant'], [mandat.sales, 'Commercial'], [mandat.sourceur, 'Sourcing'],
    [mandat.assignedTo, !mandat.recruteur ? 'Consultant' : mandat.sales ? 'HumanUp' : 'Commercial'], [mandat.createdBy, 'HumanUp'],
  ];
  for (const [u, role] of roles) {
    if (!u || u.status === 'ARCHIVED' || internal.some((i) => i.id === u.id)) continue;
    internal.push({ id: u.id, name: `${u.prenom ? u.prenom + ' ' : ''}${u.nom}`.trim(), email: u.email, role, avatarUrl: u.avatarUrl });
  }

  const external: Array<{ email: string; name: string }> = [];
  const pushExt = (email: string | null | undefined, name: string) => {
    const e = (email || '').toLowerCase().trim();
    if (!e || external.some((x) => x.email === e)) return;
    external.push({ email: e, name: name || e });
  };
  const contacts = await prisma.client.findMany({
    where: { entrepriseId: mandat.entrepriseId, email: { not: null } },
    select: { nom: true, prenom: true, email: true },
    take: 50,
  });
  for (const c of contacts) pushExt(c.email, `${c.prenom ? c.prenom + ' ' : ''}${c.nom}`.trim());
  for (const a of mandat.portalAccesses) pushExt(a.email, portalAuthorName(a));

  return { internal, external };
}

// ─── Déplacement d'une carte par le client ─────────────────────

export async function moveCandidature(data: {
  portalAccessId: string; mandatId: string; candidatureId: string; stage: StageCandidature;
  reason?: string; dateEntretienClient?: string; interlocuteurClient?: string;
}) {
  const existing = await prisma.candidature.findUnique({
    where: { id: data.candidatureId },
    select: { id: true, mandatId: true, stage: true, candidat: { select: { id: true, prenom: true, nom: true } } },
  });
  if (!existing || existing.mandatId !== data.mandatId) throw new NotFoundError('Candidature', data.candidatureId);
  if (!PORTAL_STAGE_ORDER.includes(data.stage) || !PORTAL_STAGE_ORDER.includes(existing.stage)) {
    throw new ForbiddenError('Déplacement non autorisé');
  }
  if (existing.stage === data.stage) return { ok: true, pending: false };
  // Placement validé par HumanUp (facture + date) : seul le consultant peut le défaire.
  if (existing.stage === 'PLACE') throw new ForbiddenError('Cette embauche est validée : contactez votre consultant pour la modifier.');

  const [mandat, access] = await Promise.all([
    prisma.mandat.findUnique({
      where: { id: data.mandatId },
      select: {
        titrePoste: true, recruteurId: true, assignedToId: true, createdById: true,
        recruteur: { select: { email: true, prenom: true } }, assignedTo: { select: { email: true, prenom: true } },
      },
    }),
    prisma.portalAccess.findUnique({ where: { id: data.portalAccessId }, select: { email: true, name: true, client: { select: { nom: true, prenom: true, email: true } } } }),
  ]);
  if (!mandat) throw new NotFoundError('Mandat', data.mandatId);
  // Mouvement attribué au consultant du mandat (stats, agenda) et tracé comme venant du client.
  const actorId = mandat.recruteurId ?? mandat.assignedToId ?? mandat.createdById ?? null;
  const consultant = mandat.recruteur ?? mandat.assignedTo;
  const auteur = access ? portalAuthorName(access) : 'Le client';
  const candidatNom = `${existing.candidat.prenom ?? ''} ${existing.candidat.nom}`.trim();
  const from = PORTAL_STAGE_LABEL[existing.stage];
  const to = PORTAL_STAGE_LABEL[data.stage];

  // Engagé = close won : l'ATS exige facture + date de démarrage. Le client
  // signale l'embauche, le consultant la valide (la carte ne bouge pas).
  const pending = data.stage === 'PLACE';
  if (pending && (await openHireTasks(data.mandatId)).includes(existing.id)) {
    return { ok: true, pending: true, already: true };
  }
  if (!pending) {
    await candidatureService.update(existing.id, {
      stage: data.stage,
      ...(data.stage === 'REFUSE' ? { motifRefus: 'CLIENT_REFUSE', motifRefusDetail: data.reason?.trim() || undefined } : {}),
      ...(data.stage === 'ENTRETIEN_CLIENT' ? { dateEntretienClient: data.dateEntretienClient, interlocuteurClient: data.interlocuteurClient?.trim() } : {}),
    } as any, actorId as string);
  }

  // Avis cohérent avec la colonne : Case = rencontrer, Perdu = écarter.
  const implied = data.stage === 'ENTRETIEN_CLIENT' ? 'RENCONTRER' : data.stage === 'REFUSE' ? 'ECARTER' : null;
  await prisma.$transaction([
    ...(implied ? [prisma.portalDecision.create({ data: { portalAccessId: data.portalAccessId, candidatureId: existing.id, decision: implied as PortalDecisionType, reason: data.reason?.trim() || null } })] : []),
    prisma.portalEvent.create({
      data: {
        portalAccessId: data.portalAccessId, mandatId: data.mandatId, candidatureId: existing.id,
        type: 'MOVE' as PortalEventType,
        payload: { from: existing.stage, to: data.stage, pending, reason: data.reason ?? null },
      },
    }),
    prisma.activite.create({
      data: {
        type: pending ? 'TACHE' : 'NOTE',
        ...(pending ? { isTache: true, tacheCompleted: false, tacheDueDate: new Date() } : {}),
        titre: pending
          ? `Le client annonce l'embauche de ${candidatNom} : passer en Gagné (facture + date de démarrage)`
          : `Portail client : ${auteur} a déplacé ${candidatNom} de « ${from} » vers « ${to} »`,
        contenu: data.reason?.trim() || null,
        entiteType: 'CANDIDAT', entiteId: existing.candidat.id,
        userId: actorId,
        source: 'SYSTEME',
        metadata: { portal: true, candidatureId: existing.id, mandatId: data.mandatId, from: existing.stage, to: data.stage },
      },
    }),
  ]);

  if (consultant?.email) {
    const sujet = pending
      ? `${auteur} annonce l'embauche de ${candidatNom} · ${mandat.titrePoste}`
      : `${auteur} a déplacé ${candidatNom} vers « ${to} » · ${mandat.titrePoste}`;
    const body = `<p>Bonjour ${esc(consultant.prenom ?? '')},</p>
      <p>Sur le portail client, <strong>${esc(auteur)}</strong> a déplacé <strong>${esc(candidatNom)}</strong> de « ${from} » vers « ${to} ».</p>
      ${pending ? '<p>Passe la candidature en <strong>Gagné</strong> dans l’ATS (montant de la facture + date de démarrage) pour valider l’embauche.</p>' : ''}
      ${data.reason?.trim() ? `<p style="border-left:3px solid #E6E9AF;padding-left:12px;color:#4a4568;">${esc(data.reason.trim())}</p>` : ''}`;
    void sendEmail(consultant.email, sujet, renderBrandedEmail({
      title: pending ? 'Embauche annoncée' : 'Mouvement client',
      bodyHtml: body,
      cta: { label: 'Ouvrir la fiche candidat', href: `${PORTAL_BASE}/candidats/${existing.candidat.id}` },
      signature: 'Propium',
    })).catch((e) => console.error('[Portal] email mouvement échoué', e));
  }

  return { ok: true, pending };
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
      portalAccess: { select: { email: true, name: true, client: { select: { nom: true, prenom: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

// ─── Fil d'activité d'un candidat (onglet « Activité » du portail) ─────

const DECISION_TEXT: Record<string, string> = { RENCONTRER: 'souhaite rencontrer ce profil', A_DISCUTER: 'veut en discuter', ECARTER: 'a écarté ce profil' };

export async function listActivity(mandatId: string, candidatureId: string) {
  const c = await prisma.candidature.findUnique({
    where: { id: candidatureId },
    select: {
      mandatId: true, dateEntretienClient: true, interlocuteurClient: true,
      stageHistory: { select: { fromStage: true, toStage: true, changedAt: true }, orderBy: { changedAt: 'asc' } },
    },
  });
  if (!c || c.mandatId !== mandatId) throw new NotFoundError('Candidature', candidatureId);

  const events = await prisma.portalEvent.findMany({
    where: { candidatureId, type: { in: ['MOVE', 'DECISION', 'COMMENT'] as PortalEventType[] } },
    select: { type: true, payload: true, createdAt: true, portalAccess: { select: { email: true, name: true, client: { select: { nom: true, prenom: true, email: true } } } } },
    orderBy: { createdAt: 'asc' },
  });

  type Item = { kind: 'STAGE' | 'MOVE' | 'DECISION' | 'COMMENT' | 'INTERVIEW'; at: Date; actor: string; text: string; detail?: string | null; stage?: string };
  const items: Item[] = [];
  const moves = events.filter((e) => e.type === 'MOVE');

  for (const h of c.stageHistory) {
    if (!PORTAL_STAGE_ORDER.includes(h.toStage)) continue;
    // Mouvement fait par le client : déjà raconté par l'événement portail.
    const byClient = moves.some((m) => (m.payload as any)?.to === h.toStage && Math.abs(m.createdAt.getTime() - h.changedAt.getTime()) < 60_000);
    if (byClient) continue;
    const firstPresentation = h.toStage === 'ENVOYE_CLIENT' && (!h.fromStage || !PORTAL_STAGE_ORDER.includes(h.fromStage));
    items.push({
      kind: 'STAGE', at: h.changedAt, actor: 'HumanUp', stage: h.toStage,
      text: firstPresentation ? 'a présenté ce profil' : `a passé le profil en « ${PORTAL_STAGE_LABEL[h.toStage]} »`,
    });
  }
  for (const e of events) {
    const actor = portalAuthorName(e.portalAccess);
    const p = (e.payload ?? {}) as any;
    if (e.type === 'MOVE') {
      items.push({
        kind: 'MOVE', at: e.createdAt, actor, stage: p.to,
        text: p.pending ? 'a annoncé l’embauche' : `a déplacé le profil en « ${PORTAL_STAGE_LABEL[p.to] ?? p.to} »`,
        detail: p.reason ?? null,
      });
    } else if (e.type === 'DECISION') {
      items.push({ kind: 'DECISION', at: e.createdAt, actor, text: DECISION_TEXT[p.decision] ?? 'a donné son avis', detail: p.reason ?? null });
    } else {
      items.push({ kind: 'COMMENT', at: e.createdAt, actor, text: 'a commenté', detail: p.preview ?? null });
    }
  }
  if (c.dateEntretienClient) {
    items.push({
      kind: 'INTERVIEW', at: c.dateEntretienClient, actor: '',
      text: c.dateEntretienClient > new Date() ? 'Entretien prévu' : 'Entretien',
      detail: c.interlocuteurClient ? `avec ${c.interlocuteurClient}` : null,
    });
  }

  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}
