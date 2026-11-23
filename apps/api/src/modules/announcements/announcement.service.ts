import { createHash } from 'crypto';
import { rawPrisma } from '../../lib/db.js';
import { dispatchAnnouncement } from '../webhooks/webhook.service.js';

/**
 * Annonces à l'équipe (remplacent les notifications Slack) : trois événements seulement, envoyés aux webhooks
 * abonnés aux types announcement.* (Humanup Chat les publie dans #news).
 *  - announcement.client_meeting : RDV client ou prospect, typé, daté, avec interlocuteurs
 *  - announcement.presentation   : présentation d'un candidat à un client (entretien client daté, avec interlocuteur)
 *  - announcement.closed_won     : placement (candidature → Gagné)
 * Mêmes signatures que les anciennes fonctions Slack ; `ref` ajoute les ids (liens, dédoublonnage).
 * Ne lève jamais : une annonce ratée ne doit pas casser l'action métier.
 */

type Ref = {
  /** Même clé = une seule annonce (ex. id de l'activité, de la candidature). */
  key?: string | null;
  userId?: string | null;
  mandatId?: string | null;
  candidatId?: string | null;
  candidatureId?: string | null;
  clientId?: string | null;
  entrepriseId?: string | null;
};

const appUrl = () => (process.env.APP_URL || 'https://ats.propium.co').replace(/\/$/, '');
const link = (path: string, id?: string | null) => (id ? `${appUrl()}/${path}/${id}` : null);
const hash = (...parts: unknown[]) => createHash('sha1').update(parts.map((p) => String(p ?? '')).join('|')).digest('hex').slice(0, 16);
const fullName = (prenom?: string | null, nom?: string | null) => [prenom, nom].filter(Boolean).join(' ') || null;

/** client : contact d'une société qui a déjà signé (statut ou mandat) ; prospect sinon. */
async function relationship(clientId?: string | null, entrepriseId?: string | null): Promise<'client' | 'prospect' | null> {
  if (!clientId && !entrepriseId) return null;
  const c = clientId
    ? await rawPrisma.client.findUnique({ where: { id: clientId }, select: { statutClient: true, entrepriseId: true } })
    : null;
  if (c && ['MANDAT_SIGNE', 'RECURRENT'].includes(String(c.statutClient))) return 'client';
  const companyId = entrepriseId ?? c?.entrepriseId ?? null;
  if (companyId && (await rawPrisma.mandat.count({ where: { entrepriseId: companyId } })) > 0) return 'client';
  return 'prospect';
}

async function safe(fn: () => Promise<unknown>, what: string) {
  try {
    await fn();
  } catch (err) {
    console.error(`[announcements] ${what}:`, (err as Error).message);
  }
}

export async function notifyNewMeeting(data: {
  titre: string;
  recruteurPrenom: string | null;
  clientNom: string | null;
  entrepriseNom: string | null;
  date: string | null;
  lieu: string | null;
  interlocuteurs?: string | null;
}, ref: Ref = {}): Promise<void> {
  await safe(async () => {
    let entrepriseId = ref.entrepriseId ?? null;
    if (!entrepriseId && ref.clientId) {
      entrepriseId = (await rawPrisma.client.findUnique({ where: { id: ref.clientId }, select: { entrepriseId: true } }))?.entrepriseId ?? null;
    }
    await dispatchAnnouncement('announcement.client_meeting',
      { type: 'meeting', id: ref.key ?? null, label: data.titre },
      {
        title: data.titre,
        by: data.recruteurPrenom,
        contact: data.clientNom ?? data.interlocuteurs ?? null,
        company: data.entrepriseNom,
        relationship: await relationship(ref.clientId, entrepriseId),
        date: data.date,
        location: data.lieu,
        url: link('clients', ref.clientId) ?? link('entreprises', entrepriseId),
      },
      { userId: ref.userId, dedupKey: `meeting:${ref.key ?? hash(data.titre, data.date, data.recruteurPrenom)}` });
  }, 'client meeting');
}

export async function notifyPresentation(data: {
  candidatPrenom: string | null;
  candidatNom: string;
  entrepriseNom: string;
  contactNom: string | null;
  mandatTitre: string;
  recruteurPrenom: string | null;
  date?: Date | null;
}, ref: Ref = {}): Promise<void> {
  await safe(async () => {
    const date = data.date ?? new Date();
    await dispatchAnnouncement('announcement.presentation',
      { type: 'application', id: ref.candidatureId ?? null, label: `${fullName(data.candidatPrenom, data.candidatNom)} → ${data.entrepriseNom}` },
      {
        candidate: fullName(data.candidatPrenom, data.candidatNom),
        company: data.entrepriseNom,
        contact: data.contactNom,
        mandate: data.mandatTitre,
        by: data.recruteurPrenom,
        date: date.toISOString(),
        url: link('mandats', ref.mandatId) ?? link('candidats', ref.candidatId),
      },
      {
        userId: ref.userId,
        // Une présentation = un candidat, un jour (la détection agenda et le pipeline ne se doublonnent pas).
        dedupKey: `presentation:${ref.key ?? hash(ref.candidatId ?? data.candidatNom, data.entrepriseNom)}:${date.toISOString().slice(0, 10)}`,
      });
  }, 'presentation');
}

export async function notifyCloseWon(data: {
  candidatPrenom: string | null;
  candidatNom: string;
  entrepriseNom: string;
  contactNom?: string | null;
  mandatTitre: string;
  feeMontant: number | null | undefined;
  feePct?: number | null;
  dateDemarrage?: Date | null;
  sourcePlacement?: string | null;
  sourceLead?: string | null;
  recruteurPrenom: string | null;
}, ref: Ref = {}): Promise<void> {
  await safe(async () => {
    await dispatchAnnouncement('announcement.closed_won',
      { type: 'mandate', id: ref.mandatId ?? null, label: data.mandatTitre },
      {
        candidate: fullName(data.candidatPrenom, data.candidatNom),
        company: data.entrepriseNom,
        contact: data.contactNom ?? null,
        mandate: data.mandatTitre,
        by: data.recruteurPrenom,
        fee: data.feeMontant ?? null,
        fee_currency: 'EUR',
        fee_percent: data.feePct ?? null,
        start_date: data.dateDemarrage ? new Date(data.dateDemarrage).toISOString() : null,
        candidate_source: data.sourcePlacement ?? null,
        lead_source: data.sourceLead ?? null,
        url: link('mandats', ref.mandatId),
      },
      { userId: ref.userId, dedupKey: `won:${ref.key ?? ref.candidatureId ?? ref.mandatId ?? hash(data.candidatNom, data.mandatTitre)}` });
  }, 'closed won');
}
