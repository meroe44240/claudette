import prisma from '../../lib/db.js';

/**
 * get_team_daily_report — rapport d'activité quotidien par personne (support standup).
 * Fenêtre : jour ouvré précédent (Europe/Paris). Le lundi → vendredi.
 * Attribution : toujours par user_id au moment de l'action (jamais par numéro de ligne).
 * Spec : pack "get_team_daily_report".
 */

// ─── Fuseau / jours ouvrés ──────────────────────────
function parisOffsetMs(at: Date): number {
  const tzName = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' })
    .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const m = /GMT([+-]\d+)/.exec(tzName);
  return (m ? parseInt(m[1], 10) : 1) * 3600000;
}
// Bornes UTC de la journée civile parisienne (y, m 1-12, d).
function parisDayBounds(y: number, m: number, d: number): { start: Date; end: Date } {
  const off = parisOffsetMs(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
  return {
    start: new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - off),
    end: new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - off),
  };
}
// Date civile parisienne d'un instant.
function parisYMD(at: Date): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}
const ymdToDate = (o: { y: number; m: number; d: number }) => new Date(Date.UTC(o.y, o.m - 1, o.d, 12, 0, 0));
const dowOf = (o: { y: number; m: number; d: number }) => ymdToDate(o).getUTCDay(); // 0=dim..6=sam
const isBiz = (o: { y: number; m: number; d: number }) => dowOf(o) !== 0 && dowOf(o) !== 6;
function addDays(o: { y: number; m: number; d: number }, n: number) {
  const dt = new Date(Date.UTC(o.y, o.m - 1, o.d + n, 12, 0, 0));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
function prevBusinessDay(o: { y: number; m: number; d: number }) {
  let cur = addDays(o, -1);
  while (!isBiz(cur)) cur = addDays(cur, -1);
  return cur;
}
function lastNBusinessDays(endInclusive: { y: number; m: number; d: number }, n: number) {
  const out = [endInclusive];
  let cur = endInclusive;
  while (out.length < n) { cur = prevBusinessDay(cur); out.push(cur); }
  return out; // du plus récent au plus ancien
}
// Semaine calendaire lundi→vendredi contenant `o`.
function weekMonToFri(o: { y: number; m: number; d: number }) {
  const dow = dowOf(o); // 0=dim..6=sam
  const backToMon = dow === 0 ? 6 : dow - 1;
  const mon = addDays(o, -backToMon);
  const fri = addDays(mon, 4);
  return { mon, fri };
}

// ─── Requêtes atomiques (comptent par user + fenêtre UTC) ──
const callsEmis = (uid: string, s: Date, e: Date) =>
  prisma.activite.count({ where: { userId: uid, type: 'APPEL', direction: 'SORTANT', createdAt: { gte: s, lt: e } } });

async function callsConnectes(uid: string, s: Date, e: Date): Promise<number> {
  // durée dans metadata.duration (secondes) — filtrage applicatif (JSON).
  const rows = await prisma.activite.findMany({
    where: { userId: uid, type: 'APPEL', direction: 'SORTANT', createdAt: { gte: s, lt: e } },
    select: { metadata: true },
  });
  return rows.filter((r) => Number((r.metadata as any)?.duration ?? 0) > 30).length;
}

// RDV client pris = bookings + meetings client, dédupliqués par googleEventId.
async function rdvNouveaux(uid: string, s: Date, e: Date): Promise<number> {
  const [bookings, meetings] = await Promise.all([
    prisma.booking.findMany({ where: { userId: uid, createdAt: { gte: s, lt: e } }, select: { googleEventId: true } }),
    prisma.activite.findMany({ where: { userId: uid, type: 'MEETING', entiteType: { in: ['CLIENT', 'ENTREPRISE'] }, createdAt: { gte: s, lt: e } }, select: { metadata: true } }),
  ]);
  const seen = new Set<string>();
  let n = 0;
  for (const b of bookings) { const k = b.googleEventId || `bk-${n}`; if (!seen.has(k)) { seen.add(k); n++; } }
  for (const mt of meetings) { const gid = (mt.metadata as any)?.googleEventId || (mt.metadata as any)?.google_event_id; const k = gid || `mt-${n}-${Math.random()}`; if (!seen.has(k)) { seen.add(k); n++; } }
  return n;
}

// push = transition → ENVOYE_CLIENT, 1 fois par candidature.
async function pushCount(uid: string, s: Date, e: Date): Promise<number> {
  const rows = await prisma.stageHistory.findMany({
    where: { changedById: uid, toStage: 'ENVOYE_CLIENT' as any, changedAt: { gte: s, lt: e } },
    select: { candidatureId: true },
  });
  return new Set(rows.map((r) => r.candidatureId)).size;
}

const screenings = (uid: string, s: Date, e: Date) =>
  prisma.stageHistory.count({ where: { changedById: uid, toStage: 'ENTRETIEN_1' as any, changedAt: { gte: s, lt: e } } });

const nouvellesPersonnes = (uid: string, s: Date, e: Date) =>
  prisma.candidature.count({ where: { createdById: uid, createdAt: { gte: s, lt: e } } });

const mouvementsPipeline = (uid: string, s: Date, e: Date) =>
  prisma.stageHistory.count({ where: { changedById: uid, changedAt: { gte: s, lt: e } } });

// Présentations réalisées (semaine) avec détail candidat · date · mandat · interlocuteur.
async function presentations(uid: string, s: Date, e: Date) {
  const rows = await prisma.stageHistory.findMany({
    where: { changedById: uid, toStage: 'ENTRETIEN_CLIENT' as any, changedAt: { gte: s, lt: e } },
    select: {
      changedAt: true,
      candidature: {
        select: {
          candidat: { select: { nom: true, prenom: true } },
          mandat: { select: { titrePoste: true, entreprise: { select: { nom: true } } } },
          interlocuteurClient: true,
        } as any,
      },
    },
    orderBy: { changedAt: 'asc' },
  });
  // dédup par candidature (une présentation compte 1 fois par semaine)
  const seen = new Set<string>();
  const list: Array<{ candidat: string; date: string; mandat: string; interlocuteur: string | null }> = [];
  for (const r of rows as any[]) {
    const c = r.candidature;
    const key = `${c?.candidat?.nom}|${c?.mandat?.titrePoste}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      candidat: `${c?.candidat?.prenom ? c.candidat.prenom + ' ' : ''}${c?.candidat?.nom ?? '?'}`.trim(),
      date: r.changedAt.toISOString().slice(0, 10),
      mandat: c?.mandat?.titrePoste ? `${c.mandat.titrePoste}${c.mandat.entreprise?.nom ? ' · ' + c.mandat.entreprise.nom : ''}` : '—',
      interlocuteur: c?.interlocuteurClient ?? null,
    });
  }
  return list;
}

async function mandats(uid: string) {
  const rows = await prisma.mandat.findMany({
    where: { assignedToId: uid, statut: { in: ['OUVERT', 'EN_COURS'] } },
    select: { isDormant: true } as any,
  });
  const actifs = (rows as any[]).filter((m) => !m.isDormant).length;
  const dormants = (rows as any[]).filter((m) => m.isDormant).length;
  return { actifs, dormants };
}

// Moyenne glissante sur 5 jours ouvrés (somme sur la fenêtre / 5).
async function avg5d(fn: (uid: string, s: Date, e: Date) => Promise<number>, uid: string, days: Array<{ y: number; m: number; d: number }>): Promise<number> {
  let total = 0;
  for (const day of days) { const { start, end } = parisDayBounds(day.y, day.m, day.d); total += await fn(uid, start, end); }
  return Math.round((total / days.length) * 10) / 10;
}

// ─── Seuils (par rôle, depuis report_thresholds) ────
async function loadThresholds(): Promise<Record<string, Record<string, number>>> {
  const rows = await (prisma as any).reportThreshold.findMany();
  const map: Record<string, Record<string, number>> = {};
  for (const r of rows) { (map[r.role] ||= {})[r.metric] = r.target; }
  return map;
}

// ─── Rapport ─────────────────────────────────────────
export async function getTeamDailyReport(reportDateOverride?: string) {
  // Date du rapport = jour ouvré précédent (ou override YYYY-MM-DD).
  const base = reportDateOverride
    ? { y: +reportDateOverride.slice(0, 4), m: +reportDateOverride.slice(5, 7), d: +reportDateOverride.slice(8, 10) }
    : prevBusinessDay(parisYMD(new Date()));
  const { start: dayStart, end: dayEnd } = parisDayBounds(base.y, base.m, base.d);
  const biz5 = lastNBusinessDays(base, 5);
  const { mon, fri } = weekMonToFri(base);
  const weekStart = parisDayBounds(mon.y, mon.m, mon.d).start;
  const weekEnd = parisDayBounds(fri.y, fri.m, fri.d).end;
  const daysLeft = Math.max(0, 5 - (dowOf(base) === 0 ? 5 : dowOf(base))); // jours ouvrés restants après J (ven=0)

  const thresholds = await loadThresholds();

  // Utilisateurs actifs classés (exclut ARCHIVED, ADMIN/Méroë, Recruteur Testeur).
  const users = (await prisma.user.findMany({
    where: {
      role: { not: 'ADMIN' },
      excludeFromTeamStats: false,
      status: 'ACTIVE',
      NOT: { nom: 'Testeur' },
    } as any,
    select: { id: true, nom: true, prenom: true, fonction: true } as any,
    orderBy: { nom: 'asc' },
  })) as any[];

  const rows = [];
  for (const u of users) {
    const role = u.fonction === 'SALES' ? 'SALES' : 'RECRUTEUR'; // LES_DEUX → traité comme RECRUTEUR (aucun actif à ce jour)
    const t = thresholds[role] || {};
    const name = `${u.prenom ? u.prenom + ' ' : ''}${u.nom}`.trim();
    const mandatsInfo = await mandats(u.id);
    const mvts = await mouvementsPipeline(u.id, dayStart, dayEnd);

    const metrics: any = {};
    const belowThreshold: string[] = []; // métriques sous le seuil
    const zeros: string[] = [];          // métriques à zéro (parmi les seuillées)
    const gaps: number[] = [];           // ratios value/target pour le tri

    if (role === 'SALES') {
      const [calls, connectes, rdv, push] = await Promise.all([
        callsEmis(u.id, dayStart, dayEnd), callsConnectes(u.id, dayStart, dayEnd),
        rdvNouveaux(u.id, dayStart, dayEnd), pushCount(u.id, dayStart, dayEnd),
      ]);
      const presList = await presentations(u.id, weekStart, weekEnd);
      const [callsAvg, rdvAvg, pushAvg] = await Promise.all([
        avg5d(callsEmis, u.id, biz5), avg5d(rdvNouveaux, u.id, biz5), avg5d(pushCount, u.id, biz5),
      ]);
      metrics.calls = { value: calls, target: t.calls ?? 40, avg_5d: callsAvg };
      metrics.calls_connectes = { value: connectes };
      metrics.rdv_nouveaux = { value: rdv, target: t.rdv_nouveaux ?? 1, avg_5d: rdvAvg };
      metrics.push = { value: push, target: t.push ?? 1, avg_5d: pushAvg };
      metrics.presentations = { value: presList.length, target: t.presentations ?? 3, window: 'week', days_left: daysLeft, list: presList };
      for (const [k, v] of [['calls', calls], ['rdv_nouveaux', rdv], ['push', push], ['presentations', presList.length]] as [string, number][]) {
        const tgt = metrics[k].target as number;
        if (v <= 0) zeros.push(k);
        if (v < tgt) belowThreshold.push(k);
        gaps.push(tgt > 0 ? v / tgt : 1);
      }
    } else {
      const [scr, np] = await Promise.all([screenings(u.id, dayStart, dayEnd), nouvellesPersonnes(u.id, dayStart, dayEnd)]);
      const [scrAvg, npAvg] = await Promise.all([avg5d(screenings, u.id, biz5), avg5d(nouvellesPersonnes, u.id, biz5)]);
      metrics.screenings = { value: scr, target: t.screenings ?? 5, avg_5d: scrAvg };
      metrics.nouvelles_personnes = { value: np, target: t.nouvelles_personnes ?? 2, avg_5d: npAvg };
      for (const [k, v] of [['screenings', scr], ['nouvelles_personnes', np]] as [string, number][]) {
        const tgt = metrics[k].target as number;
        if (v <= 0) zeros.push(k);
        if (v < tgt) belowThreshold.push(k);
        gaps.push(tgt > 0 ? v / tgt : 1);
      }
    }

    // Statut §6
    const callsCrit = role === 'SALES' && (metrics.calls.value < 0.25 * metrics.calls.target);
    let status: 'RED' | 'ORANGE' | 'GREEN';
    if (zeros.length >= 2 || callsCrit) status = 'RED';
    else if (belowThreshold.length > 0) status = 'ORANGE';
    else status = 'GREEN';

    rows.push({
      user_id: u.id, name, role, status,
      metrics, mouvements_pipeline: mvts,
      mandats_actifs: mandatsInfo.actifs, mandats_dormants: mandatsInfo.dormants,
      _gap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 1,
    });
  }

  // Tri : par écart au seuil croissant (les hors-clous en haut).
  rows.sort((a, b) => a._gap - b._gap);
  rows.forEach((r) => delete (r as any)._gap);

  return {
    date: `${base.y}-${String(base.m).padStart(2, '0')}-${String(base.d).padStart(2, '0')}`,
    generated_at: new Date().toISOString(),
    rows,
  };
}
