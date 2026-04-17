import prisma from '../../lib/db.js';

// ─── TYPES ──────────────────────────────────────────

interface SlackConfig {
  webhookUrl: string;
  enabled: boolean;
  sendTime?: string; // HH:MM format, default "09:00"
}

interface MandatPipeline {
  titre: string;
  clientNom: string | null;
  mandatId: string;
  candidatsActifs: number;
  /** Candidatures moved to ENTRETIEN_CLIENT (or further) yesterday — "profils envoyés au client" */
  profilsEnvoyesHier: number;
  dernierMouvement: string; // formatted date
  stages: {
    SOURCING: number;
    CONTACTE: number;
    ENTRETIEN_1: number;
    ENTRETIEN_CLIENT: number;
    OFFRE: number;
    PLACE: number;
    REFUSE: number;
  };
}

interface UserDailyStats {
  userId: string;
  nom: string;
  prenom: string | null;
  appels: number;
  rdv: number;
  interviews: number;
  presentations: number;
  pushes: number;
  mandats: MandatPipeline[];
}

interface AlertInfo {
  dormantMandats: { titre: string; jours: number }[];
  pushesSansReponse: number;
}

interface DailyReportData {
  date: string;
  users: UserDailyStats[];
  topPerformer: { name: string; metric: string } | null;
  alerts: AlertInfo;
}

// ─── HELPERS ────────────────────────────────────────

function getParisOffsetMs(): number {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const parisStr = now.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  return new Date(parisStr).getTime() - new Date(utcStr).getTime();
}

/** Return { start, end } as UTC Date objects representing yesterday 00:00-23:59:59 in Europe/Paris */
function getYesterdayRangeParis(): { start: Date; end: Date } {
  const offset = getParisOffsetMs();
  // "Now" in Paris
  const nowParis = new Date(Date.now() + offset);
  // Yesterday in Paris
  nowParis.setDate(nowParis.getDate() - 1);
  nowParis.setHours(0, 0, 0, 0);
  const startParis = new Date(nowParis);
  const endParis = new Date(nowParis);
  endParis.setHours(23, 59, 59, 999);
  // Convert back to UTC for DB queries
  return {
    start: new Date(startParis.getTime() - offset),
    end: new Date(endParis.getTime() - offset),
  };
}

/** Format yesterday's date as "JOUR DD mois YYYY" in French */
function formatYesterdayFr(): string {
  const offset = getParisOffsetMs();
  const nowParis = new Date(Date.now() + offset);
  nowParis.setDate(nowParis.getDate() - 1);
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  };
  const yesterdayUtc = new Date(nowParis.getTime() - offset);
  return yesterdayUtc.toLocaleDateString('fr-FR', options);
}

/** Format a Date to a short French date string (DD/MM/YYYY) */
function formatShortDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}

// ─── CORE FUNCTIONS ─────────────────────────────────

export async function getSlackConfig(): Promise<SlackConfig | null> {
  // First, try IntegrationConfig table (provider: 'slack')
  // Slack config is global (not per-user), so look for any enabled one
  const dbConfig = await prisma.integrationConfig.findFirst({
    where: { provider: 'slack', enabled: true },
  });

  if (dbConfig?.accessToken) {
    const config = dbConfig.config as Record<string, unknown> | null;
    return {
      webhookUrl: dbConfig.accessToken, // We store webhook URL in accessToken field
      enabled: dbConfig.enabled,
      sendTime: (config?.sendTime as string) || '09:00',
    };
  }

  // Fallback to env var
  const envUrl = process.env.SLACK_WEBHOOK_URL;
  if (envUrl) {
    return {
      webhookUrl: envUrl,
      enabled: true,
      sendTime: process.env.SLACK_SEND_TIME || '09:00',
    };
  }

  return null;
}

export async function saveSlackConfig(
  userId: string,
  input: { webhookUrl: string; enabled: boolean; sendTime?: string },
): Promise<SlackConfig> {
  await prisma.integrationConfig.upsert({
    where: {
      userId_provider: { userId, provider: 'slack' },
    },
    update: {
      accessToken: input.webhookUrl,
      enabled: input.enabled,
      config: { sendTime: input.sendTime || '09:00' },
    },
    create: {
      userId,
      provider: 'slack',
      accessToken: input.webhookUrl,
      enabled: input.enabled,
      config: { sendTime: input.sendTime || '09:00' },
    },
  });

  return {
    webhookUrl: input.webhookUrl,
    enabled: input.enabled,
    sendTime: input.sendTime || '09:00',
  };
}

async function gatherDailyData(): Promise<DailyReportData> {
  const { start: yesterdayStart, end: yesterdayEnd } = getYesterdayRangeParis();

  // Get all active users (exclude test accounts)
  const allUsers = await prisma.user.findMany({
    select: { id: true, nom: true, prenom: true },
  });
  const users = allUsers.filter((u) => {
    const full = `${u.prenom || ''} ${u.nom}`.toLowerCase();
    return !full.includes('test');
  });

  // Gather per-user stats for yesterday
  const userStats: UserDailyStats[] = await Promise.all(
    users.map(async (user) => {
      const [appels, rdv, interviews, presentations, pushesCount] = await Promise.all([
        // Calls yesterday
        prisma.activite.count({
          where: {
            userId: user.id,
            type: 'APPEL',
            createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
          },
        }),
        // RDV (meetings) yesterday
        prisma.activite.count({
          where: {
            userId: user.id,
            type: 'MEETING',
            createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
          },
        }),
        // Interviews: meetings linked to a CANDIDAT entity yesterday
        prisma.activite.count({
          where: {
            userId: user.id,
            type: 'MEETING',
            entiteType: 'CANDIDAT',
            createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
          },
        }),
        // Presentations: meetings linked to a CLIENT entity yesterday
        prisma.activite.count({
          where: {
            userId: user.id,
            type: 'MEETING',
            entiteType: 'CLIENT',
            createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
          },
        }),
        // Pushes created yesterday
        prisma.push.count({
          where: {
            recruiterId: user.id,
            sentAt: { gte: yesterdayStart, lte: yesterdayEnd },
          },
        }),
      ]);

      // Active mandats assigned to this user with candidature pipeline + client name
      const activeMandats = await prisma.mandat.findMany({
        where: {
          assignedToId: user.id,
          statut: { in: ['OUVERT', 'EN_COURS'] },
        },
        select: {
          id: true,
          titrePoste: true,
          updatedAt: true,
          entreprise: { select: { nom: true } },
          candidatures: {
            select: {
              id: true,
              stage: true,
              updatedAt: true,
            },
          },
        },
      });

      // Count stage transitions INTO ENTRETIEN_CLIENT (or further) yesterday
      // — these are the "new profiles sent to the client" per mandate.
      const candidatureIds = activeMandats.flatMap((m) => m.candidatures.map((c) => c.id));
      const profilesSentHistory = candidatureIds.length > 0
        ? await prisma.stageHistory.findMany({
            where: {
              candidatureId: { in: candidatureIds },
              toStage: { in: ['ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'] },
              changedAt: { gte: yesterdayStart, lte: yesterdayEnd },
            },
            select: { candidatureId: true, toStage: true },
          })
        : [];

      // Count unique candidatures (1 candidature → max 1 count per day, even if multi-stage moves)
      const candidatureIdsSentYesterday = new Set(profilesSentHistory.map((h) => h.candidatureId));

      const mandats: MandatPipeline[] = activeMandats
        .map((m) => {
          const stages = {
            SOURCING: 0,
            CONTACTE: 0,
            ENTRETIEN_1: 0,
            ENTRETIEN_CLIENT: 0,
            OFFRE: 0,
            PLACE: 0,
            REFUSE: 0,
          };

          let latestMove = m.updatedAt;
          let profilsEnvoyesHier = 0;
          for (const c of m.candidatures) {
            stages[c.stage]++;
            if (c.updatedAt > latestMove) {
              latestMove = c.updatedAt;
            }
            if (candidatureIdsSentYesterday.has(c.id)) {
              profilsEnvoyesHier++;
            }
          }

          const candidatsActifs = m.candidatures.filter(
            (c) => c.stage !== 'REFUSE' && c.stage !== 'PLACE',
          ).length;

          return {
            titre: m.titrePoste,
            clientNom: m.entreprise?.nom || null,
            mandatId: m.id,
            candidatsActifs,
            profilsEnvoyesHier,
            dernierMouvement: formatShortDateFr(latestMove),
            stages,
          };
        })
        .filter((m) => m.candidatsActifs > 0); // Only mandats with active candidates

      return {
        userId: user.id,
        nom: user.nom,
        prenom: user.prenom,
        appels,
        rdv,
        interviews,
        presentations,
        pushes: pushesCount,
        mandats,
      };
    }),
  );

  // Top performer: weighted score = appels + rdv*2 + interviews*3 + pushes*2
  let topPerformer: DailyReportData['topPerformer'] = null;
  if (userStats.length > 0) {
    const scored = userStats.map((u) => ({
      ...u,
      score: u.appels + u.rdv * 2 + u.interviews * 3 + u.pushes * 2,
    }));
    const sorted = scored.sort((a, b) => b.score - a.score);
    const top = sorted[0];
    if (top.score > 0) {
      const name = top.prenom ? `${top.prenom} ${top.nom}` : top.nom;
      const parts: string[] = [];
      if (top.appels > 0) parts.push(`${top.appels} appels`);
      if (top.rdv > 0) parts.push(`${top.rdv} RDV`);
      if (top.interviews > 0) parts.push(`${top.interviews} interviews`);
      if (top.pushes > 0) parts.push(`${top.pushes} pushes`);
      topPerformer = {
        name,
        metric: parts.join(', '),
      };
    }
  }

  // ─── Alerts ───
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Dormant mandats: active mandats with no candidature movement for 7+ days
  const allActiveMandats = await prisma.mandat.findMany({
    where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
    select: { id: true, titrePoste: true, updatedAt: true },
  });

  const dormantMandats: AlertInfo['dormantMandats'] = [];
  for (const mandat of allActiveMandats) {
    const recentActivity = await prisma.stageHistory.count({
      where: {
        candidature: { mandatId: mandat.id },
        changedAt: { gte: sevenDaysAgo },
      },
    });
    if (recentActivity === 0) {
      const daysSince = Math.floor(
        (Date.now() - mandat.updatedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      dormantMandats.push({ titre: mandat.titrePoste, jours: daysSince });
    }
  }

  // Pushes ENVOYE without response for 5+ days
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const pushesSansReponse = await prisma.push.count({
    where: {
      status: 'ENVOYE',
      sentAt: { lte: fiveDaysAgo },
    },
  });

  return {
    date: formatYesterdayFr(),
    users: userStats,
    topPerformer,
    alerts: {
      dormantMandats,
      pushesSansReponse,
    },
  };
}

// Map stage enum to short French label
const STAGE_LABELS: Record<string, string> = {
  SOURCING: 'sourcing',
  CONTACTE: 'contacté',
  ENTRETIEN_1: 'entretien',
  ENTRETIEN_CLIENT: 'client',
  OFFRE: 'offre',
};

// Daily objectives per metric
const DAILY_OBJECTIVES: Record<string, number> = {
  appels: 35,
  rdv: 1,
  presentations: 1,
  pushes: 10,
};

/** Build a 10-block progress bar: █ filled, ░ empty */
function buildProgressBar(current: number, target: number): string {
  const ratio = Math.min(current / target, 1);
  const filled = Math.round(ratio * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

/** Build a single objective line with emoji prefix, ratio, and bar */
function buildObjLine(emoji: string, current: number, target: number): string {
  const bar = buildProgressBar(current, target);
  if (current >= target) {
    return `✅ ${emoji} ${current}/${target}  ${bar}`;
  }
  if (current === 0) {
    return `⚠️ ${emoji} 0/${target}  ${bar}`;
  }
  return `${emoji} ${current}/${target}  ${bar}`;
}

function buildSlackBlocks(data: DailyReportData): object {
  const blocks: object[] = [];

  // Header — compact "📊 *HumanUp — 14 avril*"
  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: `📊 *HumanUp — ${data.date}*` },
  });

  // Per-recruiter sections
  for (const user of data.users) {
    const hasActivity = user.appels + user.rdv + user.interviews + user.presentations + user.pushes > 0;

    // Skip recruiter if all stats are 0 AND no active mandats
    if (!hasActivity && user.mandats.length === 0) continue;

    const displayName = user.prenom ? `${user.prenom} ${user.nom}` : user.nom;

    // Progress bar lines per objective
    const objLines = [
      buildObjLine('📞', user.appels, DAILY_OBJECTIVES.appels),
      buildObjLine('📅', user.rdv, DAILY_OBJECTIVES.rdv),
      buildObjLine('🤝', user.presentations, DAILY_OBJECTIVES.presentations),
      buildObjLine('📨', user.pushes, DAILY_OBJECTIVES.pushes),
    ];

    // Add interviews as info line (no objective)
    if (user.interviews > 0) {
      objLines.push(`🎯 ${user.interviews} entretien${user.interviews > 1 ? 's' : ''}`);
    }

    let sectionText = `👤 *${displayName}*\n${objLines.join('\n')}`;

    // Mandats — only those with candidatsActifs > 0
    for (const m of user.mandats) {
      // Build condensed pipeline: only stages > 0
      const pipelineParts: string[] = [];
      for (const [stage, label] of Object.entries(STAGE_LABELS)) {
        const count = m.stages[stage as keyof typeof m.stages];
        if (count > 0) pipelineParts.push(`${count} ${label}`);
      }
      const pipelineStr = pipelineParts.length > 0 ? ` · ${pipelineParts.join(' · ')}` : '';

      const clientStr = m.clientNom ? ` (${m.clientNom})` : '';
      const sentStr = m.profilsEnvoyesHier > 0
        ? ` · 📤 ${m.profilsEnvoyesHier} profil${m.profilsEnvoyesHier > 1 ? 's' : ''} envoyé${m.profilsEnvoyesHier > 1 ? 's' : ''} hier`
        : '';
      sectionText += `\n• ${m.titre}${clientStr} — ${m.candidatsActifs} actif${m.candidatsActifs > 1 ? 's' : ''}${pipelineStr}${sentStr}`;
    }

    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: sectionText },
    });
  }

  blocks.push({ type: 'divider' });

  // Top performer + alerts — compact footer
  const topLine = data.topPerformer
    ? `🏆 *Top performer :* ${data.topPerformer.name} (${data.topPerformer.metric})`
    : `🏆 *Top performer :* _aucune activité hier_`;

  const alertParts: string[] = [];
  if (data.alerts.dormantMandats.length > 0) {
    alertParts.push(`${data.alerts.dormantMandats.length} mandats sans mouvement +7j`);
  }
  if (data.alerts.pushesSansReponse > 0) {
    alertParts.push(`${data.alerts.pushesSansReponse} pushes sans réponse +5j`);
  }

  const alertLine = alertParts.length > 0
    ? `\n⚠️ *Alertes :* ${alertParts.join(' · ')}`
    : '';

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: topLine + alertLine },
  });

  return { blocks };
}

// Slack bot identity
const SLACK_BOT_NAME = 'Luis Enrique';
const SLACK_BOT_ICON = process.env.SLACK_BOT_ICON_URL || 'https://ats.propium.co/uploads/slack-avatar.jpg';

export async function sendToWebhook(webhookUrl: string, payload: object): Promise<void> {
  const enriched = {
    username: SLACK_BOT_NAME,
    icon_url: SLACK_BOT_ICON,
    ...payload,
  };
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(enriched),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Slack webhook error (${response.status}): ${text}`);
  }
}

// ─── PUBLIC API ─────────────────────────────────────

export async function sendDailyReport(): Promise<{ success: boolean; message: string }> {
  const config = await getSlackConfig();
  if (!config || !config.enabled) {
    return { success: false, message: 'Slack non configuré ou désactivé' };
  }

  try {
    const data = await gatherDailyData();
    const payload = buildSlackBlocks(data);
    await sendToWebhook(config.webhookUrl, payload);
    console.log(`[Slack] Daily report sent successfully at ${new Date().toISOString()}`);
    return { success: true, message: 'Rapport quotidien envoyé avec succès' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('[Slack] Failed to send daily report:', msg);
    return { success: false, message: `Erreur: ${msg}` };
  }
}

export async function sendTestReport(
  webhookUrl?: string,
): Promise<{ success: boolean; message: string }> {
  const url = webhookUrl || (await getSlackConfig())?.webhookUrl;
  if (!url) {
    return { success: false, message: 'Aucune URL webhook configurée' };
  }

  try {
    const data = await gatherDailyData();
    const payload = buildSlackBlocks(data);

    // Add a test banner at the top
    const blocks = (payload as any).blocks as object[];
    blocks.unshift({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🧪 *Message de test* — Ceci est un aperçu du rapport quotidien.`,
      },
    });

    await sendToWebhook(url, payload);
    console.log(`[Slack] Test report sent to ${url.substring(0, 40)}...`);
    return { success: true, message: 'Message de test envoyé avec succès' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur inconnue';
    console.error('[Slack] Failed to send test report:', msg);
    return { success: false, message: `Erreur: ${msg}` };
  }
}

// ─── REAL-TIME EVENT NOTIFICATIONS ────────────────

/**
 * Notify Slack when a candidature reaches ENTRETIEN_CLIENT (presentation to client).
 */
export async function notifyPresentation(data: {
  candidatPrenom: string | null;
  candidatNom: string;
  entrepriseNom: string;
  contactNom: string | null;
  mandatTitre: string;
  recruteurPrenom: string | null;
}): Promise<void> {
  const config = await getSlackConfig();
  if (!config || !config.enabled) return;

  const candidatName = [data.candidatPrenom, data.candidatNom].filter(Boolean).join(' ');
  const recruteur = data.recruteurPrenom || 'Non assigné';
  const contact = data.contactNom || 'Non renseigné';

  const payload = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `🤝 *Nouvelle présentation*`,
            ``,
            `👤 ${candidatName}`,
            `🏢 ${data.entrepriseNom} — ${contact}`,
            `📋 Mandat : ${data.mandatTitre}`,
            `👔 Recruteur : ${recruteur}`,
          ].join('\n'),
        },
      },
    ],
  };

  try {
    await sendToWebhook(config.webhookUrl, payload);
    console.log(`[Slack] Presentation notification sent: ${candidatName} → ${data.entrepriseNom}`);
  } catch (err) {
    console.error('[Slack] Failed to send presentation notification:', err);
  }
}

/**
 * Notify Slack when a candidature reaches ENTRETIEN_1 (RDV client booké).
 */
export async function notifyRdvClient(data: {
  candidatPrenom: string | null;
  candidatNom: string;
  entrepriseNom: string;
  contactNom: string | null;
  mandatTitre: string;
  dateEntretien: Date | null;
  recruteurPrenom: string | null;
}): Promise<void> {
  const config = await getSlackConfig();
  if (!config || !config.enabled) return;

  const candidatName = [data.candidatPrenom, data.candidatNom].filter(Boolean).join(' ');
  const recruteur = data.recruteurPrenom || 'Non assigné';
  const contact = data.contactNom || 'Non renseigné';

  let dateLine = '🕐 Date à confirmer';
  if (data.dateEntretien) {
    const d = data.dateEntretien;
    const datePart = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });
    const timePart = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
    dateLine = `🕐 ${datePart} à ${timePart}`;
  }

  const payload = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `📅 *RDV client booké*`,
            ``,
            `👤 ${candidatName}`,
            `🏢 ${data.entrepriseNom} — ${contact}`,
            `📋 Mandat : ${data.mandatTitre}`,
            dateLine,
            `👔 Recruteur : ${recruteur}`,
          ].join('\n'),
        },
      },
    ],
  };

  try {
    await sendToWebhook(config.webhookUrl, payload);
    console.log(`[Slack] RDV notification sent: ${candidatName}`);
  } catch (err) {
    console.error('[Slack] Failed to send RDV notification:', err);
  }
}

/**
 * Notify Slack when a new mandat is created (nouvelle opportunité).
 */
export async function notifyNouvelleOpportunite(data: {
  mandatTitre: string;
  entrepriseNom: string;
  recruteurPrenom: string | null;
  feeMontantEstime: number | null | undefined;
}): Promise<void> {
  const config = await getSlackConfig();
  if (!config || !config.enabled) return;

  const recruteur = data.recruteurPrenom || 'Non assigné';
  const feeLine = data.feeMontantEstime
    ? `💰 Fee estimé : ${data.feeMontantEstime.toLocaleString('fr-FR')} €`
    : `💰 Fee estimé : _Non renseigné_`;

  const payload = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `🌟 *Nouvelle opportunité*`,
            ``,
            `📋 ${data.mandatTitre}`,
            `🏢 ${data.entrepriseNom}`,
            `👔 Recruteur assigné : ${recruteur}`,
            feeLine,
          ].join('\n'),
        },
      },
    ],
  };

  try {
    await sendToWebhook(config.webhookUrl, payload);
    console.log(`[Slack] Nouvelle opportunité notification sent: ${data.mandatTitre}`);
  } catch (err) {
    console.error('[Slack] Failed to send nouvelle opportunité notification:', err);
  }
}

/**
 * Notify Slack when a candidature reaches PLACE or mandat reaches GAGNE (close won).
 */
export async function notifyCloseWon(data: {
  candidatPrenom: string | null;
  candidatNom: string;
  entrepriseNom: string;
  mandatTitre: string;
  feeMontant: number | null | undefined;
  recruteurPrenom: string | null;
}): Promise<void> {
  const config = await getSlackConfig();
  if (!config || !config.enabled) return;

  const candidatName = [data.candidatPrenom, data.candidatNom].filter(Boolean).join(' ');
  const recruteur = data.recruteurPrenom || 'Non assigné';
  const feeLine = data.feeMontant
    ? `💰 Fee : ${data.feeMontant.toLocaleString('fr-FR')} €`
    : `💰 Fee : _À confirmer_`;

  const payload = {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `🏆 *CLOSE WON*`,
            ``,
            `👤 ${candidatName} → ${data.entrepriseNom}`,
            `📋 Mandat : ${data.mandatTitre}`,
            feeLine,
            `👔 Recruteur : ${recruteur}`,
            ``,
            `Félicitations ! 🎉`,
          ].join('\n'),
        },
      },
    ],
  };

  try {
    await sendToWebhook(config.webhookUrl, payload);
    console.log(`[Slack] Close Won notification sent: ${candidatName} → ${data.entrepriseNom}`);
  } catch (err) {
    console.error('[Slack] Failed to send Close Won notification:', err);
  }
}

// ─── NEW MEETING NOTIFICATION ─────────────────────

/**
 * Notify Slack when a new meeting/RDV is created.
 */
export async function notifyNewMeeting(data: {
  titre: string;
  recruteurPrenom: string | null;
  clientNom: string | null;
  entrepriseNom: string | null;
  date: string | null;
  lieu: string | null;
}): Promise<void> {
  const config = await getSlackConfig();
  if (!config || !config.enabled) return;

  const recruteur = data.recruteurPrenom || 'Non assigné';
  const lines = [`📅 *Nouveau RDV*`, ``];
  lines.push(`📋 ${data.titre}`);
  if (data.clientNom) lines.push(`👤 Contact : ${data.clientNom}`);
  if (data.entrepriseNom) lines.push(`🏢 ${data.entrepriseNom}`);
  if (data.date) {
    const d = new Date(data.date);
    const datePart = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });
    const timePart = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
    lines.push(`🕐 ${datePart} à ${timePart}`);
  }
  if (data.lieu) lines.push(`📍 ${data.lieu}`);
  lines.push(`👔 Recruteur : ${recruteur}`);

  const payload = {
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }],
  };

  try {
    await sendToWebhook(config.webhookUrl, payload);
    console.log(`[Slack] New meeting notification sent: ${data.titre}`);
  } catch (err) {
    console.error('[Slack] Failed to send meeting notification:', err);
  }
}

// ─── PUSH CV NOTIFICATION ──────────────────────────

export async function sendPushNotification(data: {
  candidatName: string;
  entrepriseName: string;
  siren?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  status: string;
  autoDetected?: boolean;
}): Promise<void> {
  const config = await getSlackConfig();
  if (!config || !config.enabled) return;

  const appUrl = process.env.APP_URL || 'https://ats.propium.co';
  const sirenLine = data.siren ? ` (SIREN: ${data.siren})` : '';
  const contactLine = [data.contactName, data.contactEmail].filter(Boolean).join(' — ');

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `📤 Push CV ${data.autoDetected ? '(auto-détecté)' : ''}`,
          emoji: true,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Candidat*\n${data.candidatName}` },
          { type: 'mrkdwn', text: `*Entreprise*\n${data.entrepriseName}${sirenLine}` },
          { type: 'mrkdwn', text: `*Contact*\n${contactLine || '_Non renseigné_'}` },
          { type: 'mrkdwn', text: `*Statut*\n${data.status}` },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `📊 <${appUrl}/pushes|Voir les pushes>` },
        ],
      },
    ],
  };

  try {
    await sendToWebhook(config.webhookUrl, payload);
    console.log(`[Slack] Push notification sent: ${data.candidatName} → ${data.entrepriseName}`);
  } catch (err) {
    console.error('[Slack] Failed to send push notification:', err);
  }
}

// ─── PUSH REPLY NOTIFICATION ──────────────────────────

export async function sendPushReplyNotification(data: {
  candidatName: string;
  entrepriseName: string;
  contactName?: string | null;
  category: string;
  keyPoints: string[];
  suggestedAction: string;
  recruiterId: string;
}): Promise<void> {
  const config = await getSlackConfig();
  if (!config || !config.enabled) return;

  const categoryEmoji: Record<string, string> = {
    interested: '🟢',
    interview_requested: '🔥',
    declined: '🔴',
    needs_more_info: '🟡',
    out_of_office: '✈️',
    other: '⚪',
  };

  const categoryLabel: Record<string, string> = {
    interested: 'Intéressé',
    interview_requested: 'Entretien demandé',
    declined: 'Refusé',
    needs_more_info: 'Demande d\'infos',
    out_of_office: 'Absent (OOO)',
    other: 'Autre',
  };

  const emoji = categoryEmoji[data.category] || '⚪';
  const label = categoryLabel[data.category] || data.category;
  const keyPointsText = data.keyPoints.length > 0
    ? data.keyPoints.map(p => `• ${p}`).join('\n')
    : '_Aucun point clé_';

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Réponse Push CV — ${label}`,
          emoji: true,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Candidat*\n${data.candidatName}` },
          { type: 'mrkdwn', text: `*Entreprise*\n${data.entrepriseName}` },
          { type: 'mrkdwn', text: `*Contact*\n${data.contactName || '_Non renseigné_'}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Points clés :*\n${keyPointsText}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Action suggérée :*\n${data.suggestedAction}` },
      },
    ],
  };

  try {
    await sendToWebhook(config.webhookUrl, payload);
    console.log(`[Slack] Push reply notification: ${data.candidatName} → ${data.entrepriseName} (${data.category})`);
  } catch (err) {
    console.error('[Slack] Failed to send push reply notification:', err);
  }
}

// ─── DUPLICATE PUSH ALERT ──────────────────────────

export async function sendDuplicatePushAlert(data: {
  candidatName: string;
  entrepriseName: string;
  originalRecruiter: string;
  monthsAgo: number;
  recruiterId: string;
}): Promise<void> {
  const config = await getSlackConfig();
  if (!config || !config.enabled) return;

  const payload = {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ Push CV en doublon détecté',
          emoji: true,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Candidat*\n${data.candidatName}` },
          { type: 'mrkdwn', text: `*Entreprise*\n${data.entrepriseName}` },
          { type: 'mrkdwn', text: `*Déjà pushé par*\n${data.originalRecruiter}` },
          { type: 'mrkdwn', text: `*Il y a*\n${data.monthsAgo} mois` },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '🚫 Ce push a été bloqué automatiquement pour éviter un envoi en doublon.',
          },
        ],
      },
    ],
  };

  try {
    await sendToWebhook(config.webhookUrl, payload);
    console.log(`[Slack] Duplicate push alert: ${data.candidatName} → ${data.entrepriseName}`);
  } catch (err) {
    console.error('[Slack] Failed to send duplicate push alert:', err);
  }
}
