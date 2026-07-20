/**
 * Recap bi-hebdomadaire — agregation.
 *
 * `buildRecap(windowStart, windowEnd)` retourne un `RecapPayload` avec deux
 * sections :
 *   1. Mandats actifs : pipeline (count + anciennete par stage) + prez
 *      prevues (MEETING futurs sur les candidats ou dateEntretienClient a venir).
 *   2. Activite par personne (sales / recruteur / totaux).
 *
 * Perf : StageHistory batche en 1 passe sur toutes les candidatures actives.
 */

import prisma from '../../lib/db.js';
import type {
  Fonction,
  MandatBase,
  MandatRecap,
  ParPersonne,
  PipelineBucket,
  PresentationPrevue,
  RecapPayload,
  RecapTotaux,
  Stage,
  UserBlocRecruteur,
  UserBlocSales,
  UserRef,
} from './recap.types.js';

const ACTIVE_STAGES: Stage[] = [
  'SOURCING',
  'CONTACTE',
  'ENTRETIEN_1',
  'ENVOYE_CLIENT',
  'ENTRETIEN_CLIENT',
  'OFFRE',
];

const DAY_MS = 1000 * 60 * 60 * 24;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}

function toUserRef(u: {
  id: string;
  email: string;
  nom: string;
  prenom: string | null;
  fonction: Fonction;
  excludeFromTeamStats: boolean;
}): UserRef {
  const label = [u.prenom, u.nom].filter(Boolean).join(' ').trim() || u.email;
  return {
    id: u.id,
    label,
    fonction: u.fonction,
    excludeFromTeamStats: u.excludeFromTeamStats,
  };
}

// ─── Main ────────────────────────────────────────────

export async function buildRecap(windowStart: Date, windowEnd: Date): Promise<RecapPayload> {
  const now = new Date();

  // ── 1. Mandats actifs + users ─────────────────────────
  const [mandatsRaw, allUsers] = await Promise.all([
    prisma.mandat.findMany({
      where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
      select: {
        id: true,
        titrePoste: true,
        createdAt: true,
        salesId: true,
        recruteurId: true,
        entreprise: { select: { id: true, nom: true } },
        client: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
          },
        },
        candidatures: {
          where: { stage: { notIn: ['PLACE', 'REFUSE'] } },
          select: {
            id: true,
            stage: true,
            createdAt: true,
            dateEntretienClient: true,
            candidat: {
              select: { id: true, nom: true, prenom: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        nom: true,
        prenom: true,
        fonction: true,
        excludeFromTeamStats: true,
      },
    }),
  ]);

  const userMap = new Map<string, UserRef>();
  for (const u of allUsers) userMap.set(u.id, toUserRef(u));

  const candidatureIds = mandatsRaw.flatMap((m) => m.candidatures.map((c) => c.id));
  const candidatIds = mandatsRaw.flatMap((m) => m.candidatures.map((c) => c.candidat.id));
  const mandatIds = mandatsRaw.map((m) => m.id);

  // ── 2. StageHistory (1 passe) — anciennete par candidature + totaux window ──
  const [stageHistoriesActive, windowStageHistoriesAll, futureMeetings, windowMandatsCrees, activitesWindow] =
    await Promise.all([
      candidatureIds.length > 0
        ? prisma.stageHistory.findMany({
            where: { candidatureId: { in: candidatureIds } },
            orderBy: { changedAt: 'desc' },
            select: { candidatureId: true, changedAt: true },
          })
        : [],

      prisma.stageHistory.findMany({
        where: { changedAt: { gte: windowStart, lte: windowEnd } },
        select: {
          toStage: true,
          changedById: true,
          candidature: {
            select: {
              mandat: { select: { salesId: true, recruteurId: true } },
            },
          },
        },
      }),

      // Futurs MEETING lies aux candidats des mandats actifs => prez a venir
      candidatIds.length > 0
        ? prisma.activite.findMany({
            where: {
              type: 'MEETING',
              entiteType: 'CANDIDAT',
              entiteId: { in: candidatIds },
            },
            select: {
              titre: true,
              entiteId: true,
              metadata: true,
            },
          })
        : [],

      prisma.mandat.findMany({
        where: { createdAt: { gte: windowStart, lte: windowEnd } },
        select: { salesId: true },
      }),

      // Activites de la fenetre — pour compter appels/RDV par user
      prisma.activite.findMany({
        where: {
          createdAt: { gte: windowStart, lte: windowEnd },
          type: { in: ['APPEL', 'MEETING'] },
        },
        select: { type: true, userId: true },
      }),
    ]);

  // Derniere transition par candidature (le premier vu dans orderBy desc)
  const latestStageChange = new Map<string, Date>();
  for (const h of stageHistoriesActive) {
    if (!latestStageChange.has(h.candidatureId)) {
      latestStageChange.set(h.candidatureId, h.changedAt);
    }
  }

  // ── 3. Grouper les futurs MEETINGs par candidat ──
  const futureMeetingsByCandidat = new Map<string, Array<{ at: Date; label: string }>>();
  for (const m of futureMeetings) {
    const meta = m.metadata as { startTime?: string } | null;
    if (!meta?.startTime || !m.entiteId) continue;
    const at = new Date(meta.startTime);
    if (isNaN(at.getTime()) || at < now) continue;
    const arr = futureMeetingsByCandidat.get(m.entiteId) ?? [];
    arr.push({ at, label: m.titre ?? 'RDV' });
    futureMeetingsByCandidat.set(m.entiteId, arr);
  }

  // ── 4. Construction des mandats ──
  const mandats: MandatRecap[] = [];

  for (const m of mandatsRaw) {
    const sales = m.salesId ? userMap.get(m.salesId) ?? null : null;
    const recruteur = m.recruteurId ? userMap.get(m.recruteurId) ?? null : null;

    const clientLabel = m.client
      ? [m.client.prenom, m.client.nom].filter(Boolean).join(' ').trim() ||
        m.client.email ||
        null
      : null;

    const base: MandatBase = {
      id: m.id,
      titrePoste: m.titrePoste,
      entreprise: m.entreprise.nom,
      clientLabel,
      sales,
      recruteur,
    };

    // Pipeline buckets (count + oldestDays), stages actifs uniquement
    const bucketMap = new Map<Stage, { count: number; oldest: Date | null }>();
    for (const s of ACTIVE_STAGES) bucketMap.set(s, { count: 0, oldest: null });

    for (const c of m.candidatures) {
      const stage = c.stage as Stage;
      if (!ACTIVE_STAGES.includes(stage)) continue;
      const b = bucketMap.get(stage)!;
      b.count += 1;
      const anchor = latestStageChange.get(c.id) ?? c.createdAt;
      if (!b.oldest || anchor < b.oldest) b.oldest = anchor;
    }

    const pipeline: PipelineBucket[] = ACTIVE_STAGES.map((stage) => {
      const b = bucketMap.get(stage)!;
      const oldestDays = b.oldest ? daysBetween(b.oldest, now) : null;
      return { stage, count: b.count, oldestDays };
    });

    const totalActifs = pipeline.reduce((s, p) => s + p.count, 0);

    // Prez prevues : MEETING futurs sur les candidats + dateEntretienClient futur
    const presentationsPrevues: PresentationPrevue[] = [];
    for (const c of m.candidatures) {
      const candidatLabel =
        [c.candidat.prenom, c.candidat.nom].filter(Boolean).join(' ').trim() ||
        '(candidat sans nom)';

      // MEETINGs Google Calendar
      const meets = futureMeetingsByCandidat.get(c.candidat.id) ?? [];
      for (const meet of meets) {
        presentationsPrevues.push({
          candidatId: c.candidat.id,
          candidatLabel,
          at: meet.at,
          source: 'RDV',
          label: meet.label,
        });
      }

      // dateEntretienClient dans le futur (independant des MEETINGs)
      if (c.dateEntretienClient && c.dateEntretienClient > now) {
        presentationsPrevues.push({
          candidatId: c.candidat.id,
          candidatLabel,
          at: c.dateEntretienClient,
          source: 'DATE_ENTRETIEN',
        });
      }
    }
    presentationsPrevues.sort((a, b) => a.at.getTime() - b.at.getTime());

    mandats.push({
      ...base,
      ageJours: daysBetween(m.createdAt, now),
      pipeline,
      totalActifs,
      presentationsPrevues,
    });
  }

  // Tri : plus de candidats actifs d'abord, puis prez prevues, puis age decroissant
  mandats.sort((a, b) => {
    if (b.totalActifs !== a.totalActifs) return b.totalActifs - a.totalActifs;
    if (b.presentationsPrevues.length !== a.presentationsPrevues.length)
      return b.presentationsPrevues.length - a.presentationsPrevues.length;
    return b.ageJours - a.ageJours;
  });

  // ── 5. Activite par personne ─────────────────────────
  const parPersonne = buildParPersonne({
    users: allUsers.map(toUserRef),
    activitesWindow,
    windowStageHistoriesAll,
    windowMandatsCrees,
    userMap,
  });

  return {
    windowStart,
    windowEnd,
    generatedAt: now,
    mandats,
    parPersonne,
  };
}

// ─── Section 2 — activite par personne ───────────────

function buildParPersonne(input: {
  users: UserRef[];
  activitesWindow: Array<{ type: string; userId: string | null }>;
  windowStageHistoriesAll: Array<{
    toStage: string;
    changedById: string | null;
    candidature: {
      mandat: { salesId: string | null; recruteurId: string | null };
    };
  }>;
  windowMandatsCrees: Array<{ salesId: string | null }>;
  userMap: Map<string, UserRef>;
}): ParPersonne {
  const { users, activitesWindow, windowStageHistoriesAll, windowMandatsCrees } = input;

  const appelsByUser = new Map<string, number>();
  const rdvByUser = new Map<string, number>();
  const entretiensRByUser = new Map<string, number>();
  const presentationsByUser = new Map<string, number>();
  const envoyesClientBySales = new Map<string, number>();
  const entretiensClientBySales = new Map<string, number>();
  const placementsBySales = new Map<string, number>();
  const nouveauxMandatsBySales = new Map<string, number>();

  const inc = (map: Map<string, number>, key: string | null) => {
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + 1);
  };

  for (const a of activitesWindow) {
    if (a.type === 'APPEL') inc(appelsByUser, a.userId);
    else if (a.type === 'MEETING') inc(rdvByUser, a.userId);
  }

  for (const h of windowStageHistoriesAll) {
    const salesId = h.candidature.mandat.salesId;
    const recruteurId = h.candidature.mandat.recruteurId;
    switch (h.toStage) {
      case 'ENTRETIEN_1':
        inc(entretiensRByUser, recruteurId);
        break;
      case 'ENVOYE_CLIENT':
        inc(presentationsByUser, recruteurId);
        inc(envoyesClientBySales, salesId);
        break;
      case 'ENTRETIEN_CLIENT':
        inc(entretiensClientBySales, salesId);
        break;
      case 'PLACE':
        inc(placementsBySales, salesId);
        break;
    }
  }

  for (const m of windowMandatsCrees) inc(nouveauxMandatsBySales, m.salesId);

  const sales: UserBlocSales[] = users
    .filter((u) => u.fonction === 'SALES' || u.fonction === 'LES_DEUX')
    .map((u) => ({
      user: u,
      nouveauxRdv: rdvByUser.get(u.id) ?? 0,
      nouveauxMandats: nouveauxMandatsBySales.get(u.id) ?? 0,
      appels: appelsByUser.get(u.id) ?? 0,
      candidaturesEnvoyeesClient: envoyesClientBySales.get(u.id) ?? 0,
    }))
    .sort((a, b) => a.user.label.localeCompare(b.user.label));

  const recruteurs: UserBlocRecruteur[] = users
    .filter((u) => u.fonction === 'RECRUTEUR' || u.fonction === 'LES_DEUX')
    .map((u) => ({
      user: u,
      appels: appelsByUser.get(u.id) ?? 0,
      entretiensRecruteur: entretiensRByUser.get(u.id) ?? 0,
      presentations: presentationsByUser.get(u.id) ?? 0,
    }))
    .sort((a, b) => a.user.label.localeCompare(b.user.label));

  const sumForTeam = (map: Map<string, number>) => {
    let s = 0;
    for (const [uid, n] of map) {
      const u = input.userMap.get(uid);
      if (u && !u.excludeFromTeamStats) s += n;
    }
    return s;
  };
  const sumAll = (map: Map<string, number>) => {
    let s = 0;
    for (const n of map.values()) s += n;
    return s;
  };

  const totaux: RecapTotaux = {
    appelsEquipe: sumForTeam(appelsByUser),
    rdvEquipe: sumForTeam(rdvByUser),
    entretiensRecruteurEquipe: sumForTeam(entretiensRByUser),
    presentationsEquipe: sumForTeam(presentationsByUser),
    entretiensClientEquipe: sumForTeam(entretiensClientBySales),
    placementsEquipe: sumForTeam(placementsBySales),
    nouveauxMandatsEquipe: sumForTeam(nouveauxMandatsBySales),
    appelsGrandTotal: sumAll(appelsByUser),
    rdvGrandTotal: sumAll(rdvByUser),
  };

  return { sales, recruteurs, totaux };
}
