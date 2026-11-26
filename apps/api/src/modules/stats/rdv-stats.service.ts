/**
 * Compteurs RDV et CV, par personne et par période (heure de Paris).
 *
 *  - RDV pris      : RDV client, présentation ou entretien candidat, compté le jour
 *                    où il a été pris (création de l'événement Google).
 *  - RDV effectués : statut EFFECTUE (présence Google Meet ou confirmation), compté
 *                    le jour du RDV. No-show, annulés et « à confirmer » à part.
 *  - CV soumis     : candidature passée en « Envoi client » (CV joint, profil sans
 *                    pièce jointe ou changement d'étape), plus les envois spontanés
 *                    sans mandat. Une fois par candidat et par entreprise.
 */

import prisma from '../../lib/db.js';
import { zonedDate, zonedToUtc } from '../../lib/timezone.js';
import {
  RDV_KINDS, meetingKindOf, meetingDate, meetingEnd, datePrise, rdvStatutOf, type MeetingKind,
} from '../meetings/meeting-kind.js';

const TZ = 'Europe/Paris';
export type RdvPeriod = 'week' | 'month' | 'quarter';

export function periodBounds(period: RdvPeriod, now = new Date()): { start: Date; end: Date } {
  const { y, m, d } = zonedDate(now.getTime(), TZ);
  if (period === 'week') {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche
    const back = dow === 0 ? 6 : dow - 1;
    const mon = new Date(Date.UTC(y, m - 1, d - back));
    const next = new Date(Date.UTC(y, m - 1, d - back + 7));
    return {
      start: new Date(zonedToUtc(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate(), 0, 0, TZ)),
      end: new Date(zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, TZ)),
    };
  }
  if (period === 'month') {
    const nm = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
    return { start: new Date(zonedToUtc(y, m, 1, 0, 0, TZ)), end: new Date(zonedToUtc(nm.y, nm.m, 1, 0, 0, TZ)) };
  }
  const q = Math.floor((m - 1) / 3);
  const qs = q * 3 + 1;
  const qe = qs + 3 > 12 ? { y: y + 1, m: qs + 3 - 12 } : { y, m: qs + 3 };
  return { start: new Date(zonedToUtc(y, qs, 1, 0, 0, TZ)), end: new Date(zonedToUtc(qe.y, qe.m, 1, 0, 0, TZ)) };
}

export interface RdvCounters {
  pris: number;
  prisParType: Record<'RDV_CLIENT' | 'PRESENTATION' | 'INTERVIEW', number>;
  effectues: number;
  effectuesParType: Record<'RDV_CLIENT' | 'PRESENTATION' | 'INTERVIEW', number>;
  noShow: number;
  annules: number;
  aConfirmer: number;
  aVenir: number;
  cvSoumis: number;
}

const emptyByKind = () => ({ RDV_CLIENT: 0, PRESENTATION: 0, INTERVIEW: 0 });
const empty = (): RdvCounters => ({
  pris: 0, prisParType: emptyByKind(), effectues: 0, effectuesParType: emptyByKind(),
  noShow: 0, annules: 0, aConfirmer: 0, aVenir: 0, cvSoumis: 0,
});

const inRange = (d: Date | null, s: Date, e: Date) => !!d && d >= s && d < e;

/** Compteurs pour une liste de personnes sur [start, end). */
export async function rdvCounters(userIds: string[], start: Date, end: Date): Promise<Map<string, RdvCounters>> {
  const out = new Map<string, RdvCounters>(userIds.map((u) => [u, empty()]));
  if (!userIds.length) return out;

  // Un RDV tenu dans la période a pu être pris des semaines avant.
  const meetings = await prisma.activite.findMany({
    where: {
      type: 'MEETING',
      userId: { in: userIds },
      createdAt: { gte: new Date(start.getTime() - 120 * 86400000), lt: end },
    },
    select: { userId: true, entiteType: true, entiteId: true, createdAt: true, metadata: true },
  });

  const seen = new Set<string>();
  const now = new Date();
  for (const mt of meetings) {
    const c = out.get(mt.userId!);
    if (!c) continue;
    const kind = meetingKindOf(mt) as MeetingKind;
    if (!RDV_KINDS.includes(kind)) continue;
    const k = kind as keyof RdvCounters['prisParType'];
    const gid = (mt.metadata as any)?.googleEventId;
    if (gid) {
      if (seen.has(gid)) continue;
      seen.add(gid);
    }

    if (inRange(datePrise(mt), start, end)) {
      c.pris++;
      c.prisParType[k]++;
    }

    const when = meetingDate(mt);
    if (!inRange(when, start, end)) continue;
    const statut = rdvStatutOf(mt);
    if (statut === 'EFFECTUE') {
      c.effectues++;
      c.effectuesParType[k]++;
    } else if (statut === 'NO_SHOW') c.noShow++;
    else if (statut === 'ANNULE') c.annules++;
    else if (statut === 'A_CONFIRMER') c.aConfirmer++;
    else if (statut === 'PREVU') {
      const fin = meetingEnd(mt);
      if (when! > now) c.aVenir++;
      // Terminé depuis plus de 2 h sans présence lue : à confirmer (même règle que la liste).
      else if (fin && fin.getTime() < now.getTime() - 2 * 3600 * 1000) c.aConfirmer++;
      else c.aVenir++; // en cours ou tout juste terminé : vérification Meet à venir
    }
    // Sans statut : RDV antérieur au suivi (plus de 30 jours), non compté.
  }

  // CV soumis : passages en « Envoi client » + envois spontanés (sans mandat).
  const [transitions, spontanes] = await Promise.all([
    prisma.stageHistory.findMany({
      where: { changedById: { in: userIds }, toStage: 'ENVOYE_CLIENT' as any, changedAt: { gte: start, lt: end } },
      select: { changedById: true, candidature: { select: { candidatId: true, mandat: { select: { entrepriseId: true } } } } },
    }),
    prisma.activite.findMany({
      where: {
        userId: { in: userIds },
        type: 'EMAIL',
        entiteType: 'CANDIDAT',
        createdAt: { gte: start, lt: end },
        metadata: { path: ['opportuniste'], equals: true },
      },
      select: { userId: true, entiteId: true, metadata: true },
    }),
  ]);
  const cvKeys = new Map<string, Set<string>>();
  const addCv = (uid: string | null, candidatId: string | null | undefined, entrepriseId: string | null | undefined) => {
    if (!uid || !candidatId || !out.has(uid)) return;
    const set = cvKeys.get(uid) ?? new Set<string>();
    set.add(`${candidatId}:${entrepriseId ?? '-'}`);
    cvKeys.set(uid, set);
  };
  for (const t of transitions as any[]) addCv(t.changedById, t.candidature?.candidatId, t.candidature?.mandat?.entrepriseId);
  for (const a of spontanes) addCv(a.userId, a.entiteId, (a.metadata as any)?.entrepriseId);
  for (const [uid, set] of cvKeys) out.get(uid)!.cvSoumis = set.size;

  return out;
}

function sum(list: RdvCounters[]): RdvCounters {
  const t = empty();
  for (const c of list) {
    t.pris += c.pris; t.effectues += c.effectues; t.noShow += c.noShow; t.annules += c.annules;
    t.aConfirmer += c.aConfirmer; t.aVenir += c.aVenir; t.cvSoumis += c.cvSoumis;
    for (const k of Object.keys(t.prisParType) as Array<keyof RdvCounters['prisParType']>) {
      t.prisParType[k] += c.prisParType[k];
      t.effectuesParType[k] += c.effectuesParType[k];
    }
  }
  return t;
}

/** Page Analytics : l'admin voit l'équipe, les autres se voient eux-mêmes. */
export async function getRdvStats(requesterId: string, period: RdvPeriod, targetUserId?: string) {
  const requester = await prisma.user.findUnique({ where: { id: requesterId }, select: { role: true } });
  const isAdmin = requester?.role === 'ADMIN';
  const { start, end } = periodBounds(period);

  const team = isAdmin
    ? await prisma.user.findMany({
        where: { status: 'ACTIVE', excludeFromTeamStats: false, estAgent: false, NOT: { nom: 'Testeur' } } as any,
        select: { id: true, prenom: true, nom: true, fonction: true },
        orderBy: { prenom: 'asc' },
      })
    : await prisma.user.findMany({ where: { id: requesterId }, select: { id: true, prenom: true, nom: true, fonction: true } });

  const counters = await rdvCounters(team.map((u) => u.id), start, end);
  const users = team.map((u) => ({
    userId: u.id,
    name: `${u.prenom ?? ''} ${u.nom}`.trim(),
    fonction: u.fonction,
    ...counters.get(u.id)!,
  }));
  const selectedId = isAdmin && targetUserId ? targetUserId : requesterId;
  const selected = users.find((u) => u.userId === selectedId) ?? null;

  return {
    period,
    start: start.toISOString(),
    end: end.toISOString(),
    selected,
    total: sum(users),
    users: isAdmin ? users : [],
  };
}
