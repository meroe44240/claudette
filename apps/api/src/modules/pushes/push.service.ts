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
  recruiterId?: string;
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

  // Create new prospect
  const prospect = await prisma.prospect.create({
    data: {
      companyName: data.companyName,
      contactName: data.contactName,
      contactEmail: data.contactEmail,
      contactLinkedin: data.contactLinkedin,
      sector: data.sector,
    },
  });

  // ── Also sync to CRM: create Entreprise + Client if they don't exist ──
  try {
    await syncProspectToCRM(data, data.recruiterId);
  } catch (err) {
    console.error('[Push] CRM sync error (non-blocking):', err);
  }

  return prospect;
}

/**
 * Sync a prospect to the CRM by creating/finding Entreprise + Client.
 * Non-blocking — errors here don't prevent the push from being created.
 */
async function syncProspectToCRM(
  data: { companyName: string; contactName?: string; contactEmail?: string; contactLinkedin?: string; sector?: string },
  recruiterId?: string,
) {
  if (!data.companyName) return;

  // 1. Find or create Entreprise
  let entreprise = await prisma.entreprise.findFirst({
    where: { nom: { equals: data.companyName, mode: 'insensitive' } },
  });

  if (!entreprise) {
    entreprise = await prisma.entreprise.create({
      data: {
        nom: data.companyName,
        secteur: data.sector || null,
        createdById: recruiterId || null,
      },
    });
    console.log(`[Push→CRM] Entreprise creee: ${entreprise.nom} (${entreprise.id})`);
  }

  // 2. Find or create Client (contact) if we have a name
  if (data.contactName) {
    const nameParts = data.contactName.split(' ');
    const prenom = nameParts[0] || '';
    const nom = nameParts.slice(1).join(' ') || data.contactName;

    // Check if client already exists (by email or name+entreprise)
    let existingClient = null;
    if (data.contactEmail) {
      existingClient = await prisma.client.findFirst({
        where: { email: data.contactEmail },
      });
    }
    if (!existingClient) {
      existingClient = await prisma.client.findFirst({
        where: {
          nom: { equals: nom, mode: 'insensitive' },
          prenom: { equals: prenom, mode: 'insensitive' },
          entrepriseId: entreprise.id,
        },
      });
    }

    if (!existingClient) {
      const client = await prisma.client.create({
        data: {
          nom,
          prenom,
          email: data.contactEmail || null,
          linkedinUrl: data.contactLinkedin || null,
          entrepriseId: entreprise.id,
          statutClient: 'LEAD',
          typeClient: 'OUTBOUND',
          createdById: recruiterId || null,
          assignedToId: recruiterId || null,
        },
      });
      console.log(`[Push→CRM] Client cree: ${prenom} ${nom} @ ${entreprise.nom} (${client.id})`);
    }
  }
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
  const prospect = await upsertProspect({ ...data.prospect, recruiterId: data.recruiterId });

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

  // Auto-trigger Persistance Client sequence after push
  let sequenceRun = null;
  try {
    const { triggerPersistenceSequence } = await import('../sequences/sequence.service.js');
    sequenceRun = await triggerPersistenceSequence({
      pushId: push.id,
      prospectId: prospect.id,
      prospectName: prospect.contactName || prospect.companyName,
      prospectCompany: prospect.companyName,
      prospectEmail: prospect.contactEmail || undefined,
      candidatName,
      recruiterId: data.recruiterId,
    });
  } catch (err) {
    console.error('[Push] Error auto-triggering persistence sequence:', err);
  }

  return {
    push_id: push.id,
    prospect_id: prospect.id,
    tasks_created: tasks.length,
    sequence_started: !!sequenceRun,
    sequence_run_id: sequenceRun?.id,
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

// ─── PUSH HISTORY (paginated, rich) ────────────────

export async function getPushHistory(filters: {
  page?: number;
  limit?: number;
  recruiterId?: string;
  status?: PushStatus;
  canal?: PushCanal;
  from?: string;
  to?: string;
  search?: string;
}) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 25));
  const skip = (page - 1) * limit;

  const where: any = {};

  if (filters.recruiterId) where.recruiterId = filters.recruiterId;
  if (filters.status) where.status = filters.status;
  if (filters.canal) where.canal = filters.canal;

  if (filters.from || filters.to) {
    where.sentAt = {};
    if (filters.from) where.sentAt.gte = new Date(filters.from);
    if (filters.to) where.sentAt.lte = new Date(filters.to);
  }

  if (filters.search) {
    const s = filters.search;
    where.OR = [
      { candidat: { nom: { contains: s, mode: 'insensitive' } } },
      { candidat: { prenom: { contains: s, mode: 'insensitive' } } },
      { prospect: { companyName: { contains: s, mode: 'insensitive' } } },
      { prospect: { contactName: { contains: s, mode: 'insensitive' } } },
    ];
  }

  const [pushes, total] = await Promise.all([
    prisma.push.findMany({
      where,
      orderBy: { sentAt: 'desc' },
      skip,
      take: limit,
      include: {
        candidat: { select: { nom: true, prenom: true, posteActuel: true } },
        prospect: { select: { companyName: true, contactName: true, contactEmail: true } },
        recruiter: { select: { nom: true, prenom: true } },
      },
    }),
    prisma.push.count({ where }),
  ]);

  // Fetch sequence runs linked to these pushes
  const pushIds = pushes.map(p => p.id);
  const sequenceRuns = pushIds.length > 0
    ? await prisma.sequenceRun.findMany({
        where: { pushId: { in: pushIds } },
        select: { id: true, pushId: true, status: true, currentStep: true },
      })
    : [];
  const seqByPush = new Map(sequenceRuns.map(sr => [sr.pushId, sr]));

  return {
    pushes: pushes.map(p => ({
      id: p.id,
      candidat: {
        nom: p.candidat.nom,
        prenom: p.candidat.prenom,
        posteActuel: p.candidat.posteActuel,
      },
      prospect: {
        companyName: p.prospect.companyName,
        contactName: p.prospect.contactName,
        contactEmail: p.prospect.contactEmail,
      },
      recruiter: {
        nom: p.recruiter.nom,
        prenom: p.recruiter.prenom,
      },
      canal: p.canal,
      status: p.status,
      sentAt: p.sentAt,
      message_preview: p.message ? p.message.substring(0, 100) : null,
      sequence_run: seqByPush.get(p.id) ? {
        id: seqByPush.get(p.id)!.id,
        status: seqByPush.get(p.id)!.status,
        currentStep: seqByPush.get(p.id)!.currentStep,
      } : null,
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

// ─── DASHBOARD STATS ───────────────────────────────

export async function getDashboardStats(filters: {
  period?: string;
  recruiterId?: string;
}) {
  const period = filters.period || 'month';
  let startDate: Date;
  switch (period) {
    case 'week': startDate = startOfWeek(); break;
    case 'quarter': startDate = startOfQuarter(); break;
    case 'month':
    default: startDate = startOfMonth(); break;
  }

  const where: any = { sentAt: { gte: startDate } };
  if (filters.recruiterId) where.recruiterId = filters.recruiterId;

  const pushes = await prisma.push.findMany({
    where,
    include: {
      recruiter: { select: { id: true, nom: true, prenom: true } },
      prospect: { select: { id: true, companyName: true, contactName: true } },
    },
    orderBy: { sentAt: 'asc' },
  });

  // Totals
  const totals = { sent: 0, opened: 0, responded: 0, rdv_booked: 0, converted: 0, sans_suite: 0 };
  for (const p of pushes) {
    totals.sent++;
    if (p.status === 'OUVERT' || p.status === 'REPONDU' || p.status === 'RDV_BOOK' || p.status === 'CONVERTI_MANDAT') totals.opened++;
    if (p.status === 'REPONDU' || p.status === 'RDV_BOOK' || p.status === 'CONVERTI_MANDAT') totals.responded++;
    if (p.status === 'RDV_BOOK' || p.status === 'CONVERTI_MANDAT') totals.rdv_booked++;
    if (p.status === 'CONVERTI_MANDAT') totals.converted++;
    if (p.status === 'SANS_SUITE') totals.sans_suite++;
  }

  // Conversion funnel
  const conversion_funnel = {
    opened_pct: totals.sent > 0 ? Math.round((totals.opened / totals.sent) * 100) : 0,
    responded_pct: totals.sent > 0 ? Math.round((totals.responded / totals.sent) * 100) : 0,
    rdv_booked_pct: totals.sent > 0 ? Math.round((totals.rdv_booked / totals.sent) * 100) : 0,
    converted_pct: totals.sent > 0 ? Math.round((totals.converted / totals.sent) * 100) : 0,
  };

  // By canal
  const by_canal: Record<string, number> = {};
  for (const p of pushes) {
    by_canal[p.canal] = (by_canal[p.canal] || 0) + 1;
  }

  // By recruiter
  const recruiterMap = new Map<string, { id: string; name: string; sent: number; responded: number; converted: number }>();
  for (const p of pushes) {
    const rName = `${p.recruiter.prenom || ''} ${p.recruiter.nom}`.trim();
    const r = recruiterMap.get(p.recruiterId) || { id: p.recruiterId, name: rName, sent: 0, responded: 0, converted: 0 };
    r.sent++;
    if (['REPONDU', 'RDV_BOOK', 'CONVERTI_MANDAT'].includes(p.status)) r.responded++;
    if (p.status === 'CONVERTI_MANDAT') r.converted++;
    recruiterMap.set(p.recruiterId, r);
  }

  // Timeline (pushes per day)
  const timelineMap = new Map<string, number>();
  for (const p of pushes) {
    const day = p.sentAt.toISOString().slice(0, 10);
    timelineMap.set(day, (timelineMap.get(day) || 0) + 1);
  }
  const timeline = [...timelineMap.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top prospects by response rate
  const prospectMap = new Map<string, { id: string; name: string; company: string; total: number; responded: number }>();
  for (const p of pushes) {
    const key = p.prospect.id;
    const pr = prospectMap.get(key) || {
      id: p.prospect.id,
      name: p.prospect.contactName || '',
      company: p.prospect.companyName,
      total: 0,
      responded: 0,
    };
    pr.total++;
    if (['REPONDU', 'RDV_BOOK', 'CONVERTI_MANDAT'].includes(p.status)) pr.responded++;
    prospectMap.set(key, pr);
  }
  const top_prospects = [...prospectMap.values()]
    .filter(p => p.total >= 1)
    .map(p => ({ ...p, response_rate: Math.round((p.responded / p.total) * 100) }))
    .sort((a, b) => b.response_rate - a.response_rate || b.responded - a.responded)
    .slice(0, 5);

  // Average response time: from ENVOYE sentAt to updatedAt for REPONDU pushes
  // We approximate by looking at pushes that have REPONDU+ status
  const respondedPushes = pushes.filter(p => ['REPONDU', 'RDV_BOOK', 'CONVERTI_MANDAT'].includes(p.status));
  let avg_response_time_hours: number | null = null;
  if (respondedPushes.length > 0) {
    const totalHours = respondedPushes.reduce((sum, p) => {
      const diffMs = p.updatedAt.getTime() - p.sentAt.getTime();
      return sum + diffMs / (1000 * 60 * 60);
    }, 0);
    avg_response_time_hours = Math.round((totalHours / respondedPushes.length) * 10) / 10;
  }

  return {
    period,
    start_date: startDate,
    totals,
    conversion_funnel,
    by_canal,
    by_recruiter: [...recruiterMap.values()],
    timeline,
    top_prospects,
    avg_response_time_hours,
  };
}

// ─── EXPORT PUSH HISTORY AS CSV ────────────────────

export async function exportPushesCSV(filters: {
  recruiterId?: string;
  status?: PushStatus;
  canal?: PushCanal;
  from?: string;
  to?: string;
  search?: string;
}): Promise<string> {
  const where: any = {};

  if (filters.recruiterId) where.recruiterId = filters.recruiterId;
  if (filters.status) where.status = filters.status;
  if (filters.canal) where.canal = filters.canal;

  if (filters.from || filters.to) {
    where.sentAt = {};
    if (filters.from) where.sentAt.gte = new Date(filters.from);
    if (filters.to) where.sentAt.lte = new Date(filters.to);
  }

  if (filters.search) {
    const s = filters.search;
    where.OR = [
      { candidat: { nom: { contains: s, mode: 'insensitive' } } },
      { candidat: { prenom: { contains: s, mode: 'insensitive' } } },
      { prospect: { companyName: { contains: s, mode: 'insensitive' } } },
      { prospect: { contactName: { contains: s, mode: 'insensitive' } } },
    ];
  }

  const pushes = await prisma.push.findMany({
    where,
    orderBy: { sentAt: 'desc' },
    include: {
      candidat: { select: { nom: true, prenom: true, posteActuel: true } },
      prospect: { select: { companyName: true, contactName: true, contactEmail: true } },
      recruiter: { select: { nom: true, prenom: true } },
    },
  });

  const escapeCSV = (val: string | null | undefined) => {
    if (!val) return '';
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const header = 'Date,Candidat,Poste Actuel,Entreprise Prospect,Contact,Email Contact,Recruteur,Canal,Statut,Message';
  const rows = pushes.map(p => [
    p.sentAt.toISOString().slice(0, 10),
    escapeCSV(`${p.candidat.prenom || ''} ${p.candidat.nom}`.trim()),
    escapeCSV(p.candidat.posteActuel),
    escapeCSV(p.prospect.companyName),
    escapeCSV(p.prospect.contactName),
    escapeCSV(p.prospect.contactEmail),
    escapeCSV(`${p.recruiter.prenom || ''} ${p.recruiter.nom}`.trim()),
    p.canal,
    p.status,
    escapeCSV(p.message ? p.message.substring(0, 200).replace(/\n/g, ' ') : ''),
  ].join(','));

  return [header, ...rows].join('\n');
}
