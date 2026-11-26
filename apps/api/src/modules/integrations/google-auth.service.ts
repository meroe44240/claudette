/**
 * Jetons Google partagés (Gmail + Calendar + Meet) et santé de la connexion.
 *
 * Les configs `gmail` et `calendar` d'un utilisateur portent les mêmes jetons
 * (un seul OAuth Google). On essaie chaque refresh token connu avant de
 * déclarer la connexion cassée.
 *
 * Connexion cassée (refresh refusé par Google) :
 *  - on la note dans config.authError des deux configs (lue par /integrations/status
 *    pour le bandeau de l'interface) ;
 *  - on prévient la personne par email, au plus une fois par 24 h.
 * Une reconnexion ou un refresh réussi efface l'erreur.
 */

import prisma from '../../lib/db.js';
import { sendEmail, renderBrandedEmail } from '../../lib/mailer.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const ALERT_EVERY_MS = 24 * 60 * 60 * 1000;

export interface GoogleAuthError {
  at: string;
  message: string;
  notifiedAt?: string;
}

type Cfg = Record<string, any>;

/**
 * Jeton d'accès Google valide pour l'utilisateur, ou null si la connexion
 * n'existe pas ou est cassée (l'erreur est alors enregistrée et signalée).
 */
export async function getGoogleAccessToken(userId: string): Promise<string | null> {
  // Compte archivé (personne partie) : plus aucune lecture de sa boîte mail ni de son agenda.
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!owner || (owner as any).status === 'ARCHIVED') return null;

  const configs = await prisma.integrationConfig.findMany({
    where: { userId, provider: { in: ['gmail', 'calendar'] }, enabled: true },
  });
  if (!configs.length) return null;

  // Jeton encore valide (marge 5 min) sur l'une des deux configs.
  const fresh = configs.find(
    (c) => c.accessToken && c.tokenExpiry && c.tokenExpiry.getTime() > Date.now() + 5 * 60 * 1000,
  );
  if (fresh?.accessToken) return fresh.accessToken;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;

  // Gmail d'abord (c'est lui qui est mis à jour à chaque reconnexion), puis calendar.
  const ordered = [...configs].sort((a, b) => (a.provider === 'gmail' ? -1 : 1) - (b.provider === 'gmail' ? -1 : 1));
  const tried = new Set<string>();
  let lastError = 'no refresh token';

  for (const cfg of ordered) {
    if (!cfg.refreshToken || tried.has(cfg.refreshToken)) continue;
    tried.add(cfg.refreshToken);
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: cfg.refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const tokens = (await res.json()) as any;
      if (tokens.error || !tokens.access_token) {
        lastError = tokens.error_description || tokens.error || `HTTP ${res.status}`;
        continue;
      }
      const tokenExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
      // Les deux configs reçoivent le nouveau jeton (et le bon refresh token).
      for (const c of configs) {
        const conf = (c.config as Cfg) || {};
        const { authError: _drop, ...rest } = conf;
        await prisma.integrationConfig.update({
          where: { id: c.id },
          data: {
            accessToken: tokens.access_token,
            tokenExpiry,
            refreshToken: cfg.refreshToken,
            ...(conf.authError ? { config: rest } : {}),
          },
        });
      }
      return tokens.access_token as string;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  await recordGoogleAuthError(userId, lastError);
  return null;
}

/** Version qui lève une erreur, pour les appels faits depuis l'interface. */
export async function requireGoogleAccessToken(userId: string): Promise<string> {
  const token = await getGoogleAccessToken(userId);
  if (!token) {
    const { AppError } = await import('../../lib/errors.js');
    throw new AppError(400, 'Connexion Google expirée. Reconnectez votre compte Google dans Paramètres > Intégrations.');
  }
  return token;
}

async function recordGoogleAuthError(userId: string, message: string): Promise<void> {
  const configs = await prisma.integrationConfig.findMany({
    where: { userId, provider: { in: ['gmail', 'calendar'] } },
  });
  const now = new Date();
  const previous = configs
    .map((c) => ((c.config as Cfg) || {}).authError as GoogleAuthError | undefined)
    .find(Boolean);
  const lastNotified = previous?.notifiedAt ? new Date(previous.notifiedAt).getTime() : 0;
  const shouldNotify = now.getTime() - lastNotified > ALERT_EVERY_MS;

  const authError: GoogleAuthError = {
    at: previous?.at || now.toISOString(),
    message,
    notifiedAt: shouldNotify ? now.toISOString() : previous?.notifiedAt,
  };
  for (const c of configs) {
    await prisma.integrationConfig.update({
      where: { id: c.id },
      data: { config: { ...((c.config as Cfg) || {}), authError } as any },
    });
  }
  console.warn(`[GoogleAuth] Connexion cassée pour ${userId}: ${message}`);

  if (shouldNotify) {
    await notifyBrokenConnection(userId).catch((err) =>
      console.error('[GoogleAuth] alerte email non envoyée:', err),
    );
  }
}

/** Efface l'erreur après une reconnexion réussie. */
export async function clearGoogleAuthError(userId: string): Promise<void> {
  const configs = await prisma.integrationConfig.findMany({
    where: { userId, provider: { in: ['gmail', 'calendar'] } },
  });
  for (const c of configs) {
    const conf = (c.config as Cfg) || {};
    if (!conf.authError) continue;
    const { authError: _drop, ...rest } = conf;
    await prisma.integrationConfig.update({ where: { id: c.id }, data: { config: rest } });
  }
}

export async function getGoogleAuthError(userId: string): Promise<GoogleAuthError | null> {
  const configs = await prisma.integrationConfig.findMany({
    where: { userId, provider: { in: ['gmail', 'calendar'] }, enabled: true },
    select: { config: true },
  });
  for (const c of configs) {
    const err = ((c.config as Cfg) || {}).authError as GoogleAuthError | undefined;
    if (err) return err;
  }
  return null;
}

// Email interne à l'équipe : en anglais (règle maison).
async function notifyBrokenConnection(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, prenom: true, status: true },
  });
  if (!user?.email || (user as any).status === 'ARCHIVED') return;
  const appUrl = process.env.APP_URL || 'https://ats.propium.co';
  const html = renderBrandedEmail({
    lang: 'en',
    title: 'Your Google connection has stopped',
    bodyHtml: `<p>Hi ${user.prenom || ''},</p>
<p>Propium can no longer read your Gmail and Google Calendar. Your emails and meetings are not being logged anymore, so your meeting and CV counters are incomplete.</p>
<p>Reconnecting takes a few seconds: open Settings, then Integrations, and click Connect on Google.</p>`,
    cta: { label: 'Reconnect Google', href: `${appUrl}/settings/integrations` },
  });
  await sendEmail(user.email, 'Action needed: reconnect your Google account', html);
}
