import prisma from '../../lib/db.js';

// ─── TYPES ──────────────────────────────────────────

interface SlackConfig {
  webhookUrl: string;
  enabled: boolean;
  sendTime?: string; // HH:MM format, default "19:00"
}

interface UserDailyStats {
  userId: string;
  nom: string;
  prenom: string | null;
  appels: number;
  rdv: number;
  candidatsAvances: number;
  tachesCompletees: number;
}

interface DailyReportData {
  date: string;
  users: UserDailyStats[];
  teamAppels: number;
  teamRdv: number;
  teamCandidatsAvances: number;
  teamTachesCompletees: number;
  caMonth: number;
  monthLabel: string;
  topPerformer: { name: string; appels: number; rdv: number } | null;
  dormantMandats: number;
}

// ─── HELPERS ────────────────────────────────────────

function getParisDate(date: Date = new Date()): Date {
  // Get the current time in Europe/Paris timezone
  const parisStr = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  return new Date(parisStr);
}

function getTodayStartParis(): Date {
  const paris = getParisDate();
  paris.setHours(0, 0, 0, 0);
  // Convert back to UTC for DB queries
  const offset = getParisOffsetMs();
  return new Date(paris.getTime() - offset);
}

function getMonthStartParis(): Date {
  const paris = getParisDate();
  paris.setDate(1);
  paris.setHours(0, 0, 0, 0);
  const offset = getParisOffsetMs();
  return new Date(paris.getTime() - offset);
}

function getParisOffsetMs(): number {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const parisStr = now.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  return new Date(parisStr).getTime() - new Date(utcStr).getTime();
}

function formatCA(amount: number): string {
  if (amount >= 1000) {
    return `${Math.round(amount / 1000)}k€`;
  }
  return `${amount}€`;
}

function formatDateFr(): string {
  const paris = getParisDate();
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  };
  return new Date().toLocaleDateString('fr-FR', options);
}

function getMonthLabelFr(): string {
  return new Date().toLocaleDateString('fr-FR', {
    month: 'long',
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
      sendTime: (config?.sendTime as string) || '19:00',
    };
  }

  // Fallback to env var
  const envUrl = process.env.SLACK_WEBHOOK_URL;
  if (envUrl) {
    return {
      webhookUrl: envUrl,
      enabled: true,
      sendTime: process.env.SLACK_SEND_TIME || '19:00',
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
      config: { sendTime: input.sendTime || '19:00' },
    },
    create: {
      userId,
      provider: 'slack',
      accessToken: input.webhookUrl,
      enabled: input.enabled,
      config: { sendTime: input.sendTime || '19:00' },
    },
  });

  return {
    webhookUrl: input.webhookUrl,
    enabled: input.enabled,
    sendTime: input.sendTime || '19:00',
  };
}

async function gatherDailyData(): Promise<DailyReportData> {
  const todayStart = getTodayStartParis();
  const monthStart = getMonthStartParis();

  // Get all active users
  const users = await prisma.user.findMany({
    where: { role: { not: undefined as any } },
    select: { id: true, nom: true, prenom: true },
  });

  // Gather per-user stats
  const userStats: UserDailyStats[] = await Promise.all(
    users.map(async (user) => {
      const [appels, rdv, tachesCompletees, candidatsAvances] = await Promise.all([
        // Appels today
        prisma.activite.count({
          where: {
            userId: user.id,
            type: 'APPEL',
            createdAt: { gte: todayStart },
          },
        }),
        // RDV (meetings) today
        prisma.activite.count({
          where: {
            userId: user.id,
            type: 'MEETING',
            createdAt: { gte: todayStart },
          },
        }),
        // Tasks completed today
        prisma.activite.count({
          where: {
            userId: user.id,
            isTache: true,
            tacheCompleted: true,
            updatedAt: { gte: todayStart },
          },
        }),
        // Candidates advanced: stageHistory changes today for this user's candidatures
        prisma.stageHistory.count({
          where: {
            changedById: user.id,
            changedAt: { gte: todayStart },
          },
        }),
      ]);

      return {
        userId: user.id,
        nom: user.nom,
        prenom: user.prenom,
        appels,
        rdv,
        candidatsAvances,
        tachesCompletees,
      };
    }),
  );

  // Team totals
  const teamAppels = userStats.reduce((sum, u) => sum + u.appels, 0);
  const teamRdv = userStats.reduce((sum, u) => sum + u.rdv, 0);
  const teamCandidatsAvances = userStats.reduce((sum, u) => sum + u.candidatsAvances, 0);
  const teamTachesCompletees = userStats.reduce((sum, u) => sum + u.tachesCompletees, 0);

  // CA for current month (fees billed/paid)
  const caResult = await prisma.mandat.aggregate({
    where: {
      feeStatut: { in: ['FACTURE', 'PAYE'] },
      updatedAt: { gte: monthStart },
    },
    _sum: { feeMontantFacture: true },
  });
  const caMonth = caResult._sum.feeMontantFacture || 0;

  // Top performer (weighted: appels + rdv*2)
  let topPerformer: DailyReportData['topPerformer'] = null;
  if (userStats.length > 0) {
    const sorted = [...userStats].sort(
      (a, b) => (b.appels + b.rdv * 2) - (a.appels + a.rdv * 2),
    );
    const top = sorted[0];
    if (top.appels > 0 || top.rdv > 0) {
      topPerformer = {
        name: top.prenom ? `${top.prenom} ${top.nom}` : top.nom,
        appels: top.appels,
        rdv: top.rdv,
      };
    }
  }

  // Dormant mandats (no activity for 7+ days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const activeMandats = await prisma.mandat.findMany({
    where: { statut: { in: ['OUVERT', 'EN_COURS'] } },
    select: { id: true, updatedAt: true },
  });

  let dormantCount = 0;
  for (const mandat of activeMandats) {
    const recentActivity = await prisma.activite.count({
      where: {
        entiteType: 'MANDAT',
        entiteId: mandat.id,
        createdAt: { gte: sevenDaysAgo },
      },
    });
    if (recentActivity === 0) {
      dormantCount++;
    }
  }

  return {
    date: formatDateFr(),
    users: userStats,
    teamAppels,
    teamRdv,
    teamCandidatsAvances,
    teamTachesCompletees,
    caMonth,
    monthLabel: getMonthLabelFr(),
    topPerformer,
    dormantMandats: dormantCount,
  };
}

function buildSlackBlocks(data: DailyReportData): object {
  const blocks: object[] = [];

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `📊 HumanUp — Résumé du ${data.date}`,
      emoji: true,
    },
  });

  blocks.push({ type: 'divider' });

  // Team summary
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*🏢 Équipe*\n📞 Appels : *${data.teamAppels}* | 📅 RDV : *${data.teamRdv}* | 👥 Candidats avancés : *${data.teamCandidatsAvances}* | 💰 CA ${data.monthLabel} : *${formatCA(data.caMonth)}*`,
    },
  });

  blocks.push({ type: 'divider' });

  // Per-user stats (only show users with activity)
  const activeUsers = data.users.filter(
    (u) => u.appels > 0 || u.rdv > 0 || u.candidatsAvances > 0 || u.tachesCompletees > 0,
  );

  for (const user of activeUsers) {
    const displayName = user.prenom ? `${user.prenom} ${user.nom}` : user.nom;
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${displayName}*\n📞 ${user.appels} appels | 📅 ${user.rdv} RDV | 👥 ${user.candidatsAvances} candidats avancés | ✅ ${user.tachesCompletees} tâches`,
      },
    });
  }

  // If no one had activity
  if (activeUsers.length === 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_Aucune activité enregistrée aujourd'hui._`,
      },
    });
  }

  blocks.push({ type: 'divider' });

  // Top performer + alerts
  const topLine = data.topPerformer
    ? `🏆 *Top performer du jour* : ${data.topPerformer.name} (${data.topPerformer.appels} appels + ${data.topPerformer.rdv} RDV)`
    : `🏆 *Top performer du jour* : _aucune activité_`;

  const alertLine =
    data.dormantMandats > 0
      ? `\n⚠️ *Alertes* : ${data.dormantMandats} mandat${data.dormantMandats > 1 ? 's' : ''} dormant${data.dormantMandats > 1 ? 's' : ''}`
      : '';

  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: topLine + alertLine,
    },
  });

  // Footer with link
  const appUrl = process.env.APP_URL || 'https://ats.propium.co';
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `📊 <${appUrl}/stats|Voir les stats détaillées>`,
      },
    ],
  });

  return { blocks };
}

async function sendToWebhook(webhookUrl: string, payload: object): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
