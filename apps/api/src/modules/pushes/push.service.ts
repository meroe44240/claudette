import prisma from '../../lib/db.js';
import type { PushStatus, PushCanal } from '@prisma/client';

// ─── HELPERS ────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date); d.setHours(0, 0, 0, 0); return d;
}
function startOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth(date: Date = new Date()): Date { return new Date(date.getFullYear(), date.getMonth(), 1); }
function startOfQuarter(date: Date = new Date()): Date { return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1); }

function periodToDate(period: string): Date {
  switch (period) {
    case 'today': return startOfDay();
    case 'this_week': return startOfWeek();
    case 'this_month': return startOfMonth();
    case 'this_quarter': return startOfQuarter();
    case 'this_year': return new Date(new Date().getFullYear(), 0, 1);
    default: return startOfWeek();
  }
}

// ─── UPSERT PROSPECT ───────────────────────────────

export async function upsertProspect(data: {
  id?: string;
  companyName: string;
  contactName?: string;
  contactEmail?: string;
  contactLinkedin?: string;
  sector?: string;
}) {
  // If id provided, return existing
  if (data.id) {
    const existing = await prisma.prospect.findUnique({ where: { id: data.id } });
    if (existing) return existing;
  }

  // Try to find by email or company+contact combo
  if (data.contactEmail) {
    const existing = await prisma.prospect.findFirst({ where: { contactEmail: data.contactEmail } });
    if (existing) return existing;
  }

  if (data.companyName && data.contactName) {
    const existing = await prisma.prospect.findFirst({
      where: { companyName: data.companyName, contactName: data.contactName },
    });
    if (existing) return existing;
  }

  // Create new
  return prisma.prospect.create({
    data: {
      companyName: data.companyName,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      contactLinkedin: data.contactLinkedin,
      sector: data.sector,
    },
  });
}

// ─── CREATE FOLLOW-UP TASKS ────────────────────────

async function createFollowupTasks(pushId: string, recruiterId: string, label: string) {
  const tasks = await Promise.all([
    prisma.activite.create({
      data: {
        type: 'TACHE',
        isTache: true,
        tacheCompleted: false,
        titre: `Relancer ${label}`,
        contenu: `Relance J+3 suite au push CV`,
        tacheDueDate: addDays(new Date(), 3),
        userId: recruiterId,
        source: 'AGENT_IA',
        metadata: { priority: 'HAUTE', pushId },
      },
    }),
    prisma.activite.create({
      data: {
        type: 'TACHE',
        isTache: true,
        tacheCompleted: false,
        titre: `Follow-up final — ${label}`,
        contenu: `Relance finale J+7 suite au push CV`,
        tacheDueDate: addDays(new Date(), 7),
        userId: recruiterId,
        source: 'AGENT_IA',
        metadata: { priority: 'MOYENNE', pushId },
      },
    }),
  ]);
  return tasks;
}

// ─── CREATE PUSH ────────────────────────────────────

export async function createPush(data: {
  candidatId: string;
  prospect: {
    id?: string;
    companyName: string;
    contactName?: string;
    contactEmail?: string;
    contactLinkedin?: string;
    sector?: string;
  };
  canal: PushCanal;
  message?: string;
  recruiterId: string;
  gmailThreadId?: string;
  gmailMessageId?: string;
}) {
  const prospect = await upsertProspect(data.prospect);

  const push = await prisma.push.create({
    data: {
      candidatId: data.candidatId,
      prospectId: prospect.id,
      recruiterId: data.recruiterId,
      canal: data.canal,
      message: data.message,
      gmailThreadId: data.gmailThreadId,
      gmailMessageId: data.gmailMessageId,
      gmailSentAt: data.gmailThreadId ? new Date() : undefined,
    },
    include: {
      candidat: { select: { nom: true, prenom: true } },
      prospect: { select: { companyName: true, contactName: true } },
    },
  });

  const candidatName = `${push.candidat.prenom || ''} ${push.candidat.nom}`.trim();
  const label = `${push.prospect.contactName || push.prospect.companyName} — ${candidatName}`;
  const tasks = await createFollowupTasks(push.id, data.recruiterId, label);

  return {
    push_id: push.id,
    prospect_id: prospect.id,
    tasks_created: tasks.length,
  };
}

// ─── LIST PUSHES ────────────────────────────────────

export async function listPushes(filters: {
  recruiterId?: string;
  period?: string;
  status?: PushStatus;
  team?: boolean;
}) {
  const where: any = {};

  if (filters.recruiterId && !filters.team) {
    where.recruiterId = filters.recruiterId;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.period) {
    where.sentAt = { gte: periodToDate(filters.period) };
  }

  const pushes = await prisma.push.findMany({
    where,
    orderBy: { sentAt: 'desc' },
    take: 100,
    include: {
      candidat: { select: { nom: true, prenom: true } },
      prospect: { select: { companyName: true, contactName: true } },
      recruiter: { select: { nom: true, prenom: true } },
    },
  });

  // Stats computation
  const byRecruiter = new Map<string, { name: string; count: number; repondu: number }>();
  const byStatus = new Map<string, number>();
  let convertedToMandate = 0;

  for (const p of pushes) {
    const rName = `${p.recruiter.prenom || ''} ${p.recruiter.nom}`.trim();
    const r = byRecruiter.get(p.recruiterId) || { name: rName, count: 0, repondu: 0 };
    r.count++;
    if (['REPONDU', 'RDV_BOOK', 'CONVERTI_MANDAT'].includes(p.status)) r.repondu++;
    byRecruiter.set(p.recruiterId, r);

    byStatus.set(p.status, (byStatus.get(p.status) || 0) + 1);
    if (p.status === 'CONVERTI_MANDAT') convertedToMandate++;
  }

  return {
    pushes: pushes.map(p => ({
      id: p.id,
      candidat: `${p.candidat.prenom || ''} ${p.candidat.nom}`.trim(),
      candidat_id: p.candidatId,
      prospect_company: p.prospect.companyName,
      prospect_contact: p.prospect.contactName,
      prospect_id: p.prospectId,
      recruiter: `${p.recruiter.prenom || ''} ${p.recruiter.nom}`.trim(),
      canal: p.canal,
      status: p.status,
      sent_at: p.sentAt,
      gmail_sent_at: p.gmailSentAt,
      gmail_thread_id: p.gmailThreadId,
    })),
    stats: {
      total: pushes.length,
      by_recruiter: [...byRecruiter.values()].map(r => ({
        name: r.name,
        count: r.count,
        taux_reponse: r.count > 0 ? Math.round((r.repondu / r.count) * 100) : 0,
      })),
      by_status: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
      converted_to_mandate: convertedToMandate,
    },
  };
}

// ─── UPDATE PUSH STATUS ─────────────────────────────

export async function updatePushStatus(pushId: string, newStatus: PushStatus) {
  const push = await prisma.push.findUnique({
    where: { id: pushId },
    include: {
      candidat: { select: { nom: true, prenom: true } },
      prospect: { select: { companyName: true, contactName: true } },
    },
  });
  if (!push) throw new Error('Push non trouve');

  const updated = await prisma.push.update({
    where: { id: pushId },
    data: { status: newStatus },
  });

  const label = `${push.prospect.contactName || push.prospect.companyName} — ${push.candidat.prenom || ''} ${push.candidat.nom}`.trim();

  // Auto-create tasks based on status change
  const tasksCreated: string[] = [];
  if (newStatus === 'REPONDU') {
    await prisma.activite.create({
      data: {
        type: 'TACHE', isTache: true, tacheCompleted: false,
        titre: `Qualifier le besoin — appel a booker — ${label}`,
        userId: push.recruiterId,
        source: 'AGENT_IA',
        tacheDueDate: addDays(new Date(), 1),
        metadata: { priority: 'HAUTE', pushId },
      },
    });
    tasksCreated.push('Qualifier le besoin — appel a booker');
  }

  if (newStatus === 'RDV_BOOK') {
    await prisma.activite.create({
      data: {
        type: 'TACHE', isTache: true, tacheCompleted: false,
        titre: `Preparer brief client — ${label}`,
        userId: push.recruiterId,
        source: 'AGENT_IA',
        tacheDueDate: addDays(new Date(), 0),
        metadata: { priority: 'HAUTE', pushId },
      },
    });
    tasksCreated.push('Preparer brief client');
  }

  return {
    push_id: pushId,
    status: newStatus,
    tasks_created: tasksCreated,
  };
}

// ─── TEAM STATS ─────────────────────────────────────

export async function getTeamPushStats(period: string = 'this_month') {
  const startDate = periodToDate(period);

  const users = await prisma.user.findMany({
    where: { role: { in: ['RECRUTEUR', 'ADMIN', 'MANAGER'] } },
    select: { id: true, nom: true, prenom: true },
  });

  const pushes = await prisma.push.findMany({
    where: { sentAt: { gte: startDate } },
    select: { recruiterId: true, status: true },
  });

  const byRecruiter = new Map<string, { total: number; repondu: number; rdv: number; convertis: number }>();
  for (const p of pushes) {
    const r = byRecruiter.get(p.recruiterId) || { total: 0, repondu: 0, rdv: 0, convertis: 0 };
    r.total++;
    if (['REPONDU', 'RDV_BOOK', 'CONVERTI_MANDAT'].includes(p.status)) r.repondu++;
    if (p.status === 'RDV_BOOK' || p.status === 'CONVERTI_MANDAT') r.rdv++;
    if (p.status === 'CONVERTI_MANDAT') r.convertis++;
    byRecruiter.set(p.recruiterId, r);
  }

  return {
    period,
    team: users.map(u => {
      const stats = byRecruiter.get(u.id) || { total: 0, repondu: 0, rdv: 0, convertis: 0 };
      return {
        recruiter_name: `${u.prenom || ''} ${u.nom}`.trim(),
        cv_pushed: stats.total,
        taux_reponse: stats.total > 0 ? Math.round((stats.repondu / stats.total) * 100) : 0,
        rdv_generes: stats.rdv,
        mandats_convertis: stats.convertis,
      };
    }),
  };
}

// ─── PUSH STATS FOR get_team_stats enrichment ───────

export async function getPushStatsForUsers(userIds: string[], startDate: Date) {
  const pushes = await prisma.push.findMany({
    where: { recruiterId: { in: userIds }, sentAt: { gte: startDate } },
    select: { recruiterId: true, status: true },
  });

  const result = new Map<string, { cv_pushed: number; push_taux_reponse: number; push_convertis: number }>();

  // Init all users
  for (const id of userIds) {
    result.set(id, { cv_pushed: 0, push_taux_reponse: 0, push_convertis: 0 });
  }

  const counts = new Map<string, { total: number; repondu: number; convertis: number }>();
  for (const p of pushes) {
    const c = counts.get(p.recruiterId) || { total: 0, repondu: 0, convertis: 0 };
    c.total++;
    if (['REPONDU', 'RDV_BOOK', 'CONVERTI_MANDAT'].includes(p.status)) c.repondu++;
    if (p.status === 'CONVERTI_MANDAT') c.convertis++;
    counts.set(p.recruiterId, c);
  }

  for (const [userId, c] of counts) {
    result.set(userId, {
      cv_pushed: c.total,
      push_taux_reponse: c.total > 0 ? Math.round((c.repondu / c.total) * 100) : 0,
      push_convertis: c.convertis,
    });
  }

  return result;
}
