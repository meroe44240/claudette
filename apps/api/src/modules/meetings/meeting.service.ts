import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError, AppError } from '../../lib/errors.js';
import { notifyNewMeeting } from '../slack/slack.service.js';
import * as candidatureService from '../candidatures/candidature.service.js';
import { meetingKindOf, type MeetingKind } from './meeting-kind.js';

const STAGES_ACTIFS_EXCLUS = ['REFUSE', 'PLACE'] as const;
// À partir de l'entretien client, la présentation a déjà eu lieu : on ne recule pas la candidature.
const STAGES_APRES_PRESENTATION = ['ENTRETIEN_CLIENT', 'PROCESS', 'OFFRE', 'PLACE'];

const candidatureSelect = {
  id: true,
  stage: true,
  candidat: { select: { id: true, nom: true, prenom: true } },
  mandat: { select: { titrePoste: true, entreprise: { select: { nom: true } } } },
} as const;

function serialiserCandidature(c: any) {
  return {
    id: c.id,
    stage: c.stage,
    candidat: [c.candidat?.prenom, c.candidat?.nom].filter(Boolean).join(' '),
    mandat: c.mandat?.titrePoste ?? '',
    entreprise: c.mandat?.entreprise?.nom ?? '',
  };
}

function serialiserMeeting(a: any) {
  const meta = (a.metadata ?? {}) as any;
  return {
    id: a.id,
    titre: meta.summary || a.titre || '',
    kind: meetingKindOf(a),
    startTime: meta.startTime || null,
    htmlLink: meta.htmlLink || null,
    interlocuteurs: typeof meta.interlocuteurs === 'string' ? meta.interlocuteurs : '',
    attendees: (Array.isArray(meta.attendees) ? meta.attendees : [])
      .map((att: any) => (typeof att === 'string' ? { email: att, role: 'external', name: null } : att))
      .filter((att: any) => att?.role !== 'internal')
      .map((att: any) => ({ email: att.email, role: att.role, name: att.name || null, entityId: att.entityId || null })),
  };
}

async function chargerMeeting(id: string, userId: string) {
  const activite = await prisma.activite.findUnique({ where: { id } });
  if (!activite || activite.type !== 'MEETING') throw new NotFoundError('Meeting', id);
  if (activite.userId !== userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (user?.role !== 'ADMIN') throw new AppError(403, 'Ce meeting appartient à un autre utilisateur.');
  }
  return activite;
}

/** Meetings détectés dans l'agenda et pas encore classés par la personne. */
export async function listAClasser(userId: string) {
  const rows = await prisma.activite.findMany({
    where: {
      userId,
      type: 'MEETING',
      OR: [
        { metadata: { path: ['calendarEventType'], equals: 'A_CLASSER' } },
        { metadata: { path: ['calendarEventType'], equals: 'AMBIGU' } },
      ],
      createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map(serialiserMeeting);
}

/** Détail d'un meeting à classer + candidatures probables (invités candidats, mandats des contacts clients). */
export async function getPourClassement(id: string, userId: string) {
  const activite = await chargerMeeting(id, userId);
  const meeting = serialiserMeeting(activite);

  const candidatIds = meeting.attendees.filter((a: any) => a.role === 'candidat' && a.entityId).map((a: any) => a.entityId);
  const clientIds = meeting.attendees.filter((a: any) => a.role === 'client' && a.entityId).map((a: any) => a.entityId);
  const entrepriseIds = clientIds.length
    ? (await prisma.client.findMany({ where: { id: { in: clientIds } }, select: { entrepriseId: true } }))
        .map((c) => c.entrepriseId)
        .filter((x): x is string => !!x)
    : [];

  const ou: any[] = [];
  if (candidatIds.length) ou.push({ candidatId: { in: candidatIds } });
  if (entrepriseIds.length) ou.push({ mandat: { entrepriseId: { in: entrepriseIds } } });

  const suggestions = ou.length
    ? await prisma.candidature.findMany({
        where: { stage: { notIn: [...STAGES_ACTIFS_EXCLUS] as any }, OR: ou },
        select: candidatureSelect,
        orderBy: { updatedAt: 'desc' },
        take: 30,
      })
    : [];

  const clients = clientIds.length
    ? await prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, nom: true, prenom: true, entreprise: { select: { nom: true } } },
      })
    : [];

  return {
    meeting,
    candidatures: suggestions.map(serialiserCandidature),
    clients: clients.map((c) => ({
      id: c.id,
      nom: [c.prenom, c.nom].filter(Boolean).join(' '),
      entreprise: c.entreprise?.nom ?? '',
    })),
  };
}

/** Recherche de candidatures actives par nom de candidat (choix de la présentation). */
export async function searchCandidatures(q: string) {
  const terme = q.trim();
  if (terme.length < 2) return [];
  const mots = terme.split(/\s+/).slice(0, 3);
  const rows = await prisma.candidature.findMany({
    where: {
      stage: { notIn: [...STAGES_ACTIFS_EXCLUS] as any },
      candidat: {
        AND: mots.map((m) => ({
          OR: [
            { nom: { contains: m, mode: 'insensitive' as const } },
            { prenom: { contains: m, mode: 'insensitive' as const } },
          ],
        })),
      },
    },
    select: candidatureSelect,
    orderBy: { updatedAt: 'desc' },
    take: 15,
  });
  return rows.map(serialiserCandidature);
}

export interface ClasserInput {
  kind: Exclude<MeetingKind, 'A_CLASSER'>;
  date?: string;
  interlocuteurs?: string;
  clientId?: string;
  candidatureId?: string;
}

/**
 * Valide la nature d'un meeting. Un RDV client ou une présentation exige une date
 * et des interlocuteurs ; c'est seulement à ce moment qu'il est annoncé et compté.
 */
export async function classer(id: string, userId: string, input: ClasserInput) {
  const activite = await chargerMeeting(id, userId);
  const meta = { ...((activite.metadata ?? {}) as Record<string, any>) };
  const kindAvant = meetingKindOf(activite);

  const date = input.date ? new Date(input.date) : meta.startTime ? new Date(meta.startTime) : null;
  const interlocuteurs = (input.interlocuteurs ?? '').trim();
  const dateValide = !!date && !Number.isNaN(date.getTime());

  const update: any = {};
  meta.calendarEventType = input.kind;
  meta.autoClassified = false;
  meta.classification = { by: userId, at: new Date().toISOString() };

  if (input.kind === 'RDV_CLIENT') {
    if (!dateValide) throw new ValidationError('La date du RDV est requise.');
    if (!interlocuteurs && !input.clientId) throw new ValidationError('Les interlocuteurs du RDV sont requis.');

    const client = input.clientId
      ? await prisma.client.findUnique({
          where: { id: input.clientId },
          select: { id: true, nom: true, prenom: true, entreprise: { select: { nom: true } } },
        })
      : null;
    if (input.clientId && !client) throw new NotFoundError('Client', input.clientId);

    meta.startTime = date!.toISOString();
    meta.interlocuteurs = interlocuteurs || [client?.prenom, client?.nom].filter(Boolean).join(' ');
    update.entiteType = 'CLIENT';
    update.entiteId = client?.id ?? null;
    update.titre = `📅 RDV client — ${meta.summary || activite.titre || ''}`.trim();

    const dejaAnnonce = kindAvant === 'RDV_CLIENT' && meta.annonceSlack === true;
    meta.annonceSlack = true;
    await prisma.activite.update({ where: { id }, data: { ...update, metadata: meta } });

    if (!dejaAnnonce) {
      const user = await prisma.user.findUnique({ where: { id: activite.userId ?? userId }, select: { prenom: true } });
      await notifyNewMeeting({
        titre: meta.summary || activite.titre || 'RDV client',
        recruteurPrenom: user?.prenom || null,
        clientNom: client ? [client.prenom, client.nom].filter(Boolean).join(' ') : null,
        entrepriseNom: client?.entreprise?.nom || null,
        interlocuteurs: meta.interlocuteurs,
        date: meta.startTime,
        lieu: meta.location || null,
      });
    }
    return { kind: input.kind, annonce: !dejaAnnonce };
  }

  if (input.kind === 'PRESENTATION') {
    if (!input.candidatureId) throw new ValidationError('Le candidat présenté (candidature) est requis.');
    if (!dateValide) throw new ValidationError('La date de la présentation est requise.');
    if (!interlocuteurs) throw new ValidationError("L'interlocuteur côté client est requis.");

    const candidature = await prisma.candidature.findUnique({
      where: { id: input.candidatureId },
      select: { id: true, stage: true, candidatId: true, dateEntretienClient: true },
    });
    if (!candidature) throw new NotFoundError('Candidature', input.candidatureId);

    meta.startTime = date!.toISOString();
    meta.interlocuteurs = interlocuteurs;
    meta.candidatureId = candidature.id;
    update.entiteType = 'CANDIDAT';
    update.entiteId = candidature.candidatId;
    update.titre = `🤝 Présentation — ${meta.summary || activite.titre || ''}`.trim();
    await prisma.activite.update({ where: { id }, data: { ...update, metadata: meta } });

    // La présentation, c'est la candidature en Entretien client : on l'y passe (annonce Slack
    // + comptage faits par le pipeline). Si elle y est déjà ou plus loin, on ne touche à rien.
    const dejaPresentee = STAGES_APRES_PRESENTATION.includes(candidature.stage);
    if (!dejaPresentee) {
      await candidatureService.update(
        candidature.id,
        { stage: 'ENTRETIEN_CLIENT', dateEntretienClient: date!.toISOString(), interlocuteurClient: interlocuteurs } as any,
        activite.userId ?? userId,
        meta.googleEventId ? { googleEventId: meta.googleEventId } : {},
      );
    }
    return { kind: input.kind, annonce: !dejaPresentee };
  }

  // INTERVIEW / AUTRE : simple étiquette, rien n'est annoncé.
  await prisma.activite.update({ where: { id }, data: { metadata: meta } });
  return { kind: input.kind, annonce: false };
}
