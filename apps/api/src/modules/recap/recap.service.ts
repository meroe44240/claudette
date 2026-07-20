/**
 * Recap bi-hebdomadaire — agregation.
 *
 * `buildRecap(windowStart, windowEnd)` retourne un `RecapPayload` structure,
 * consomme par le template email (chantier 3/7) et l'endpoint preview (4/7).
 *
 * Perf : les requetes sont batchees. Le calcul d'anciennete par stage
 * necessite pour chaque candidature la date de sa derniere transition ;
 * on fait UNE seule passe `StageHistory` groupee, pas N+1.
 */

import prisma from '../../lib/db.js';
import type {
  Blocages,
  Fonction,
  HealthScore,
  MandatBase,
  MandatBloc,
  MandatRecap,
  Mouvement,
  ParPersonne,
  PipelineBucket,
  ProchaineAction,
  RecapPayload,
  RecapTotaux,
  SilencieuxBloc,
  Stage,
  TacheBloc,
  UserBlocRecruteur,
  UserBlocSales,
  UserRef,
} from './recap.types.js';

// ─── Constantes ──────────────────────────────────────

/** Seuil (jours) d'anciennete par stage — au-dela, le bucket est en alerte. */
const STAGE_ALERT_DAYS: Record<Stage, number> = {
  SOURCING: 5,
  CONTACTE: 5,
  ENTRETIEN_1: 5,
  ENVOYE_CLIENT: 7,
  ENTRETIEN_CLIENT: 7,
  OFFRE: 10,
  PLACE: 30,   // rarement affiche (PLACE = ferme cote pipeline)
  REFUSE: 999, // n'apparait pas dans les buckets actifs
};

const ACTIVE_STAGES: Stage[] = [
  'SOURCING',
  'CONTACTE',
  'ENTRETIEN_1',
  'ENVOYE_CLIENT',
  'ENTRETIEN_CLIENT',
  'OFFRE',
];

const DAY_MS = 1000 * 60 * 60 * 24;

// ─── Helpers ─────────────────────────────────────────

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
  // ── 1. Fetch base : mandats actifs, users, tout en parallele ─────
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

  // ── 2. IDs derives ──────────────────────────────────
  const mandatIds = mandatsRaw.map((m) => m.id);
  const candidatureIds = mandatsRaw.flatMap((m) => m.candidatures.map((c) => c.id));
  const candidatIds = mandatsRaw.flatMap((m) => m.candidatures.map((c) => c.candidat.id));

  // ── 3. StageHistory : UNE passe pour toutes les candidatures actives ──
  const stageHistories =
    candidatureIds.length > 0
      ? await prisma.stageHistory.findMany({
          where: { candidatureId: { in: candidatureIds } },
          orderBy: { changedAt: 'desc' },
          select: {
            id: true,
            candidatureId: true,
            fromStage: true,
            toStage: true,
            changedById: true,
            changedAt: true,
          },
        })
      : [];

  // Derniere transition par candidature (max changedAt)
  const latestStageChangeByCandidature = new Map<string, Date>();
  for (const h of stageHistories) {
    if (!latestStageChangeByCandidature.has(h.candidatureId)) {
      latestStageChangeByCandidature.set(h.candidatureId, h.changedAt);
    }
  }

  // Derniere transition vers ENTRETIEN_CLIENT par candidature (pour "clients silencieux")
  const latestEntretienClientByCandidature = new Map<string, Date>();
  for (const h of stageHistories) {
    if (h.toStage !== 'ENTRETIEN_CLIENT') continue;
    if (!latestEntretienClientByCandidature.has(h.candidatureId)) {
      latestEntretienClientByCandidature.set(h.candidatureId, h.changedAt);
    }
  }

  // ── 4. Activites dans la fenetre + tous les tacheDueDate en retard ──
  const [
    activitesWindow,
    windowStageHistories,
    windowMandatsCrees,
    windowStageHistoriesAll,   // pour "nouveaux mandats" par salesId
    tachesRetardRaw,
    prochainRdvRaw,
  ] = await Promise.all([
    // Activites survenues dans la fenetre, rattachees aux mandats actifs ou leurs candidats
    prisma.activite.findMany({
      where: {
        createdAt: { gte: windowStart, lte: windowEnd },
        OR: [
          { entiteType: 'MANDAT', entiteId: { in: mandatIds } },
          { entiteType: 'CANDIDAT', entiteId: { in: candidatIds } },
        ],
      },
      select: {
        id: true,
        type: true,
        direction: true,
        entiteType: true,
        entiteId: true,
        titre: true,
        contenu: true,
        userId: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),

    // StageHistory changements dans la fenetre (pour la section "mouvements" par mandat)
    candidatureIds.length > 0
      ? prisma.stageHistory.findMany({
          where: {
            candidatureId: { in: candidatureIds },
            changedAt: { gte: windowStart, lte: windowEnd },
          },
          select: {
            candidatureId: true,
            fromStage: true,
            toStage: true,
            changedById: true,
            changedAt: true,
          },
          orderBy: { changedAt: 'asc' },
        })
      : [],

    // Mandats crees dans la fenetre — pour "nouveaux mandats par sales"
    prisma.mandat.findMany({
      where: { createdAt: { gte: windowStart, lte: windowEnd } },
      select: {
        id: true,
        salesId: true,
      },
    }),

    // StageHistory (toutes candidatures, pas juste les actives) dans la fenetre — pour totaux equipe
    prisma.stageHistory.findMany({
      where: { changedAt: { gte: windowStart, lte: windowEnd } },
      select: {
        candidatureId: true,
        toStage: true,
        changedById: true,
        candidature: {
          select: {
            createdById: true,
            mandat: {
              select: { salesId: true, recruteurId: true },
            },
          },
        },
      },
    }),

    // Taches en retard > 2j
    (async () => {
      const cutoff = new Date(Date.now() - 2 * DAY_MS);
      return prisma.activite.findMany({
        where: {
          isTache: true,
          tacheCompleted: false,
          tacheDueDate: { lt: cutoff },
        },
        select: {
          id: true,
          titre: true,
          tacheDueDate: true,
          userId: true,
          entiteType: true,
          entiteId: true,
        },
        orderBy: { tacheDueDate: 'asc' },
      });
    })(),

    // Prochains RDV (MEETING) apres windowEnd — pour "prochaine action"
    prisma.activite.findMany({
      where: {
        type: 'MEETING',
        entiteType: { in: ['MANDAT', 'CANDIDAT'] },
        OR: [
          { entiteType: 'MANDAT', entiteId: { in: mandatIds } },
          { entiteType: 'CANDIDAT', entiteId: { in: candidatIds } },
        ],
      },
      select: {
        id: true,
        titre: true,
        entiteType: true,
        entiteId: true,
        userId: true,
        metadata: true,
      },
    }),
  ]);

  // ── 5. Prochaines taches (a venir) par mandat — pour "prochaine action" ──
  const futureTasksRaw = await prisma.activite.findMany({
    where: {
      isTache: true,
      tacheCompleted: false,
      tacheDueDate: { gte: windowEnd },
      entiteType: { in: ['MANDAT', 'CANDIDAT'] },
      OR: [
        { entiteType: 'MANDAT', entiteId: { in: mandatIds } },
        { entiteType: 'CANDIDAT', entiteId: { in: candidatIds } },
      ],
    },
    select: {
      id: true,
      titre: true,
      tacheDueDate: true,
      userId: true,
      entiteType: true,
      entiteId: true,
    },
    orderBy: { tacheDueDate: 'asc' },
  });

  // ── 6. Derniere activite par mandat (pour "mandats geles") ──
  const [directActs, candActsForFreeze] = await Promise.all([
    prisma.activite.findMany({
      where: { entiteType: 'MANDAT', entiteId: { in: mandatIds } },
      select: { entiteId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    candidatIds.length > 0
      ? prisma.activite.findMany({
          where: { entiteType: 'CANDIDAT', entiteId: { in: candidatIds } },
          select: { entiteId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [],
  ]);

  // Map candidatId -> mandatId (via candidatures)
  const candidatToMandat = new Map<string, string>();
  for (const m of mandatsRaw) {
    for (const c of m.candidatures) {
      // Attention : plusieurs candidatures d'un meme candidat sur des mandats
      // differents => on stocke la derniere seen, insuffisant pour attribution
      // exacte. Ici on l'utilise juste pour "derniere activite du mandat",
      // donc c'est ok (une meme activite candidat rafraichit le mandat courant).
      candidatToMandat.set(c.candidat.id, m.id);
    }
  }

  const lastActivityByMandat = new Map<string, Date>();
  for (const a of directActs) {
    if (!a.entiteId) continue;
    const prev = lastActivityByMandat.get(a.entiteId);
    if (!prev || a.createdAt > prev) lastActivityByMandat.set(a.entiteId, a.createdAt);
  }
  for (const a of candActsForFreeze) {
    if (!a.entiteId) continue;
    const mId = candidatToMandat.get(a.entiteId);
    if (!mId) continue;
    const prev = lastActivityByMandat.get(mId);
    if (!prev || a.createdAt > prev) lastActivityByMandat.set(mId, a.createdAt);
  }

  // Egalement : dernier mouvement stage par mandat (via stageHistories full)
  const lastStageChangeByMandat = new Map<string, Date>();
  const candidatureToMandat = new Map<string, string>();
  for (const m of mandatsRaw) {
    for (const c of m.candidatures) {
      candidatureToMandat.set(c.id, m.id);
    }
  }
  for (const h of stageHistories) {
    const mId = candidatureToMandat.get(h.candidatureId);
    if (!mId) continue;
    const prev = lastStageChangeByMandat.get(mId);
    if (!prev || h.changedAt > prev) lastStageChangeByMandat.set(mId, h.changedAt);
  }

  // ── 7. Construction des blocs ────────────────────────

  const now = new Date();
  const mandats: MandatRecap[] = [];
  const mandatsGeles: MandatBloc[] = [];
  const clientsSilencieux: SilencieuxBloc[] = [];
  const mandatsSansRecruteur: MandatBase[] = [];
  const mandatsPipelineVide: MandatBase[] = [];

  // Grouper activites & stage-changes par mandat pour les "mouvements"
  const movementsByMandat = new Map<string, Mouvement[]>();
  for (const h of windowStageHistories) {
    const mId = candidatureToMandat.get(h.candidatureId);
    if (!mId) continue;
    const arr = movementsByMandat.get(mId) ?? [];
    arr.push({
      type: 'STAGE',
      at: h.changedAt,
      label: `${h.fromStage ?? 'NEW'} → ${h.toStage}`,
      user: h.changedById ? userMap.get(h.changedById) ?? null : null,
    });
    movementsByMandat.set(mId, arr);
  }
  for (const a of activitesWindow) {
    if (!a.entiteId) continue;
    const mId =
      a.entiteType === 'MANDAT' ? a.entiteId : candidatToMandat.get(a.entiteId);
    if (!mId) continue;
    const arr = movementsByMandat.get(mId) ?? [];
    arr.push({
      type: a.type === 'NOTE' ? 'NOTE' : 'ACTIVITE',
      at: a.createdAt,
      label: a.titre ?? a.type,
      detail: a.contenu ?? undefined,
      user: a.userId ? userMap.get(a.userId) ?? null : null,
    });
    movementsByMandat.set(mId, arr);
  }
  for (const arr of movementsByMandat.values()) {
    arr.sort((x, y) => x.at.getTime() - y.at.getTime());
  }

  // Prochaine action : par mandat, le RDV futur le plus proche ou la tache
  const prochaineActionByMandat = new Map<string, ProchaineAction>();

  function considerAction(mandatId: string, action: ProchaineAction) {
    const existing = prochaineActionByMandat.get(mandatId);
    if (!existing || action.at < existing.at) {
      prochaineActionByMandat.set(mandatId, action);
    }
  }

  for (const t of futureTasksRaw) {
    if (!t.entiteId || !t.tacheDueDate) continue;
    const mId =
      t.entiteType === 'MANDAT' ? t.entiteId : candidatToMandat.get(t.entiteId);
    if (!mId) continue;
    considerAction(mId, {
      type: 'TACHE',
      at: t.tacheDueDate,
      label: t.titre ?? 'Tache',
      user: t.userId ? userMap.get(t.userId) ?? null : null,
    });
  }

  for (const r of prochainRdvRaw) {
    const startRaw = (r.metadata as { startTime?: string } | null)?.startTime;
    if (!startRaw) continue;
    const at = new Date(startRaw);
    if (isNaN(at.getTime()) || at < now) continue;
    if (!r.entiteId) continue;
    const mId =
      r.entiteType === 'MANDAT' ? r.entiteId : candidatToMandat.get(r.entiteId);
    if (!mId) continue;
    considerAction(mId, {
      type: 'RDV',
      at,
      label: r.titre ?? 'RDV',
      user: r.userId ? userMap.get(r.userId) ?? null : null,
    });
  }

  // ── 7.b Iteration par mandat ─────────────────────────

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

    // Pipeline buckets
    const bucketMap = new Map<Stage, { count: number; oldest: Date | null }>();
    for (const stage of ACTIVE_STAGES) {
      bucketMap.set(stage, { count: 0, oldest: null });
    }
    for (const c of m.candidatures) {
      const stage = c.stage as Stage;
      if (!ACTIVE_STAGES.includes(stage)) continue;
      const b = bucketMap.get(stage)!;
      b.count += 1;
      const anchor = latestStageChangeByCandidature.get(c.id) ?? c.createdAt;
      if (!b.oldest || anchor < b.oldest) b.oldest = anchor;
    }

    const pipeline: PipelineBucket[] = ACTIVE_STAGES.map((stage) => {
      const b = bucketMap.get(stage)!;
      const oldestDays = b.oldest ? daysBetween(b.oldest, now) : null;
      const alerte =
        oldestDays !== null && b.count > 0 && oldestDays > STAGE_ALERT_DAYS[stage];
      return { stage, count: b.count, oldestDays, alerte };
    });

    const totalActifs = pipeline.reduce((s, p) => s + p.count, 0);

    // Health score
    const lastAct = lastActivityByMandat.get(m.id) ?? null;
    const lastStage = lastStageChangeByMandat.get(m.id) ?? null;
    const lastAnyChange =
      lastAct && lastStage
        ? lastAct > lastStage
          ? lastAct
          : lastStage
        : lastAct ?? lastStage;
    const daysSinceAnyChange = lastAnyChange ? daysBetween(lastAnyChange, now) : null;

    let healthScore: HealthScore = 'GREEN';
    if (
      !recruteur ||
      totalActifs === 0 ||
      (daysSinceAnyChange !== null && daysSinceAnyChange > 10)
    ) {
      healthScore = 'RED';
    } else if (
      pipeline.some((p) => p.alerte) ||
      (daysSinceAnyChange !== null && daysSinceAnyChange > 5)
    ) {
      healthScore = 'YELLOW';
    }

    // Prochaine action
    const prochaineAction = prochaineActionByMandat.get(m.id) ?? null;

    mandats.push({
      ...base,
      ageJours: daysBetween(m.createdAt, now),
      healthScore,
      pipeline,
      mouvements: movementsByMandat.get(m.id) ?? [],
      prochaineAction,
    });

    // ── Alimenter les blocages ─────────────────────────

    if (!m.recruteurId) mandatsSansRecruteur.push(base);
    if (totalActifs === 0) mandatsPipelineVide.push(base);

    if (lastAnyChange && daysSinceAnyChange !== null && daysSinceAnyChange > 7) {
      mandatsGeles.push({
        ...base,
        joursSansActivite: daysSinceAnyChange,
        lastActivityAt: lastAnyChange,
      });
    } else if (!lastAnyChange && daysBetween(m.createdAt, now) > 7) {
      // Jamais touche & cree il y a plus de 7j
      mandatsGeles.push({
        ...base,
        joursSansActivite: daysBetween(m.createdAt, now),
        lastActivityAt: null,
      });
    }

    // Clients silencieux : candidatures en ENTRETIEN_CLIENT avec date > 5j
    for (const c of m.candidatures) {
      if (c.stage !== 'ENTRETIEN_CLIENT') continue;
      const anchor =
        latestEntretienClientByCandidature.get(c.id) ??
        c.dateEntretienClient ??
        null;
      if (!anchor) continue;
      const jours = daysBetween(anchor, now);
      if (jours > 5) {
        const candidatLabel =
          [c.candidat.prenom, c.candidat.nom].filter(Boolean).join(' ').trim() ||
          '(candidat sans nom)';
        clientsSilencieux.push({
          ...base,
          candidatId: c.candidat.id,
          candidatLabel,
          joursDepuisEntretienClient: jours,
        });
      }
    }
  }

  mandatsGeles.sort((a, b) => b.joursSansActivite - a.joursSansActivite);
  clientsSilencieux.sort(
    (a, b) => b.joursDepuisEntretienClient - a.joursDepuisEntretienClient,
  );

  // ── 8. Taches en retard ──────────────────────────────
  const tachesEnRetard: TacheBloc[] = tachesRetardRaw
    .filter((t) => t.tacheDueDate)
    .map((t) => ({
      id: t.id,
      titre: t.titre ?? '(sans titre)',
      dueDate: t.tacheDueDate!,
      joursRetard: daysBetween(t.tacheDueDate!, now),
      user: t.userId ? userMap.get(t.userId) ?? null : null,
      entiteType: t.entiteType,
      entiteId: t.entiteId,
    }));

  const blocages: Blocages = {
    mandatsGeles,
    clientsSilencieux,
    mandatsSansRecruteur,
    mandatsPipelineVide,
    tachesEnRetard,
  };

  // ── 9. Activite par personne ─────────────────────────
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
    blocages,
    mandats,
    parPersonne,
  };
}

// ─── Section 3 — activite par personne ───────────────

function buildParPersonne(input: {
  users: UserRef[];
  activitesWindow: Array<{
    type: string;
    userId: string | null;
    entiteType: string | null;
  }>;
  windowStageHistoriesAll: Array<{
    toStage: string;
    changedById: string | null;
    candidature: {
      createdById: string | null;
      mandat: { salesId: string | null; recruteurId: string | null };
    };
  }>;
  windowMandatsCrees: Array<{ salesId: string | null }>;
  userMap: Map<string, UserRef>;
}): ParPersonne {
  const { users, activitesWindow, windowStageHistoriesAll, windowMandatsCrees } = input;

  // Compteurs par user
  const appelsByUser = new Map<string, number>();
  const rdvByUser = new Map<string, number>();
  const entretiensRByUser = new Map<string, number>();  // -> ENTRETIEN_1
  const presentationsByUser = new Map<string, number>(); // -> ENVOYE_CLIENT (attribuee au recruteur)
  const envoyesClientBySales = new Map<string, number>(); // -> ENVOYE_CLIENT attribue au sales
  const entretiensClientBySales = new Map<string, number>(); // -> ENTRETIEN_CLIENT (attribue au sales)
  const placementsBySales = new Map<string, number>(); // -> PLACE
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

  // Split sales / recruteurs
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

  // Totaux : equipe (exclut Meroe) vs grand total
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
