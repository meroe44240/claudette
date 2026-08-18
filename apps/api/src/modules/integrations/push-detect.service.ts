/**
 * Push CV detection.
 *
 * Un « push » = envoi d'un CV (pièce jointe) à un client sur un mandat.
 * On scanne les emails ENVOYÉS avec pièce jointe, on identifie le client
 * (destinataire) et le candidat (nom dans le sujet / la pièce jointe), puis :
 *  - si on est sûr (candidat identifié + mandat du client sans ambiguïté) →
 *    on passe la candidature en « Envoyé client » (ENVOYE_CLIENT) automatiquement ;
 *  - en cas de doute → on crée une TÂCHE dans l'ATS pour le recruteur
 *    (les notifs in-app ayant été retirées, la tâche est le canal « ATS »).
 *
 * Idempotent : chaque message Gmail traité laisse une activité portant
 * metadata.pushGmailMessageId ; on ne le retraite jamais.
 * Cron : appelé par le même passage que l'auto-create email (toutes les 15 min).
 */

import prisma from '../../lib/db.js';
import { matchEmail } from './gmail.service.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const STAGE_ORDER = ['SOURCING', 'CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'OFFRE', 'PLACE'];

// ─── Token (même logique que email-auto-create) ─────
async function getValidAccessToken(userId: string): Promise<string | null> {
  const config = await prisma.integrationConfig.findUnique({ where: { userId_provider: { userId, provider: 'gmail' } } });
  if (!config || !config.enabled || !config.accessToken) return null;
  if (config.tokenExpiry && config.tokenExpiry.getTime() < Date.now() + 5 * 60 * 1000) {
    if (!config.refreshToken || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, refresh_token: config.refreshToken, grant_type: 'refresh_token' }),
      });
      const tokens = (await res.json()) as any;
      if (tokens.error) return null;
      const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
      await prisma.integrationConfig.update({ where: { id: config.id }, data: { accessToken: tokens.access_token, tokenExpiry: newExpiry } });
      return tokens.access_token as string;
    } catch { return null; }
  }
  return config.accessToken;
}

// ─── Parsing d'un message Gmail (format=full) ───────
interface SentMessage {
  id: string;
  to: string[];
  subject: string;
  date: Date;
  attachments: string[]; // noms de fichiers
  snippet: string;
}

const CV_HINT = /\b(cv|dossier|profil|resume|candidat|r[ée]sum[ée])\b/i;
const emailOf = (raw: string) => (raw.match(/<([^>]+)>/)?.[1] || raw).trim().toLowerCase();

function collectAttachments(part: any, out: string[]): void {
  if (!part) return;
  if (part.filename && part.filename.trim()) out.push(part.filename.trim());
  for (const p of part.parts || []) collectAttachments(p, out);
}

async function fetchSentPushes(accessToken: string, since: Date, self: string, maxResults = 25): Promise<SentMessage[]> {
  const epoch = Math.floor(since.getTime() / 1000);
  const q = `in:sent has:attachment after:${epoch}`;
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const listData = (await listRes.json()) as any;
  if (!listData.messages?.length) return [];

  const out: SentMessage[] = [];
  const ids: string[] = listData.messages.map((m: any) => m.id);
  for (let i = 0; i < ids.length; i += 8) {
    const batch = ids.slice(i, i + 8);
    await Promise.all(batch.map(async (id) => {
      try {
        const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const d = (await r.json()) as any;
        const headers: Record<string, string> = {};
        for (const h of d.payload?.headers || []) headers[h.name.toLowerCase()] = h.value;
        const atts: string[] = [];
        collectAttachments(d.payload, atts);
        // Pièces jointes hors signatures/images inline (on garde pdf/doc)
        const docs = atts.filter((f) => /\.(pdf|docx?|odt)$/i.test(f));
        if (!docs.length) return;
        const to = (headers['to'] || '').split(',').map(emailOf).filter(Boolean);
        out.push({ id, to, subject: headers['subject'] || '', date: headers['date'] ? new Date(headers['date']) : new Date(), attachments: docs, snippet: d.snippet || '' });
      } catch (e) {
        console.warn(`[PushDetect] fetch msg ${id} failed:`, e);
      }
    }));
  }
  return out;
}

// ─── Extraction du nom du candidat ──────────────────
// Depuis le nom de la pièce jointe ("CV - Roxana Rendon.pdf", "Dossier Jean Dupont.pdf")
// et à défaut depuis le sujet. Retourne une liste de tokens (mots du nom).
function extractCandidateName(attachmentNames: string[], subject: string): string {
  const clean = (s: string) => s
    .replace(/\.(pdf|docx?|odt)$/i, '')
    .replace(/\b(cv|dossier|profil|resume|r[ée]sum[ée]|one[- ]?pager|candidature|anonymis[ée])\b/gi, ' ')
    .replace(/[_\-|]+/g, ' ')
    .replace(/\d{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const f of attachmentNames) {
    const c = clean(f);
    const m = c.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]+\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]+)/);
    if (m) return m[1].trim();
  }
  const s = subject.match(/\(([^)]+)\)/)?.[1] || subject; // "… (Roxana Rendon)"
  const m2 = clean(s).match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]+\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]+)/);
  return m2 ? m2[1].trim() : '';
}

// Cherche des candidats correspondant au nom (tokens). Priorité aux candidats
// ayant déjà une candidature sur un des mandats de l'entreprise.
async function findCandidats(name: string, entrepriseId: string | null): Promise<Array<{ id: string; prenom: string | null; nom: string }>> {
  const tokens = name.split(/\s+/).filter((t) => t.replace(/[^\p{L}]/gu, '').length >= 2);
  if (tokens.length < 2) return [];
  const first = tokens[0];
  const last = tokens.slice(1).join(' ');
  // Match (prénom≈first ET nom≈last) OU (prénom≈last ET nom≈first) — ordre parfois inversé.
  const cands = await prisma.candidat.findMany({
    where: {
      OR: [
        { AND: [{ prenom: { contains: first, mode: 'insensitive' } }, { nom: { contains: last, mode: 'insensitive' } }] },
        { AND: [{ prenom: { contains: last, mode: 'insensitive' } }, { nom: { contains: first, mode: 'insensitive' } }] },
        { nom: { contains: last, mode: 'insensitive' } },
      ],
    },
    select: { id: true, prenom: true, nom: true },
    take: 10,
  });
  if (cands.length <= 1 || !entrepriseId) return cands;
  // Départage : garder ceux liés à un mandat de l'entreprise s'il y en a.
  const linked = await prisma.candidature.findMany({
    where: { candidatId: { in: cands.map((c) => c.id) }, mandat: { entrepriseId } },
    select: { candidatId: true },
  });
  const linkedIds = new Set(linked.map((l) => l.candidatId));
  const filtered = cands.filter((c) => linkedIds.has(c.id));
  return filtered.length ? filtered : cands;
}

// ─── Traitement d'un push ───────────────────────────
async function processPush(msg: SentMessage, userId: string): Promise<'auto' | 'doubt' | 'skip'> {
  // Idempotence : déjà traité ?
  const seen = await prisma.activite.findFirst({
    where: { userId, metadata: { path: ['pushGmailMessageId'], equals: msg.id } as any },
    select: { id: true },
  });
  if (seen) return 'skip';

  const looksLikePush = msg.attachments.some((f) => CV_HINT.test(f)) || CV_HINT.test(msg.subject);
  if (!looksLikePush) return 'skip'; // pièce jointe non-CV (facture, contrat…) → pas un push

  const fileName = msg.attachments[0] || '';

  // 1) Identifier le client parmi les destinataires
  let client: { id: string; nom: string; prenom: string | null; entrepriseId: string } | null = null;
  for (const to of msg.to) {
    if (to.endsWith('@humanup.io')) continue;
    const m = await matchEmail(to);
    if (m?.type === 'CLIENT') {
      const c = await prisma.client.findUnique({ where: { id: m.id }, select: { id: true, nom: true, prenom: true, entrepriseId: true } });
      if (c) { client = c; break; }
    }
  }

  const name = extractCandidateName(msg.attachments, msg.subject);

  // 2) Client inconnu → doute (tâche générique, non rattachée)
  if (!client) {
    const to = msg.to.find((t) => !t.endsWith('@humanup.io')) || msg.to[0] || 'destinataire inconnu';
    await createDoubtTask(userId, msg, `Push CV détecté vers ${to} (client non reconnu)`, name, null);
    return 'doubt';
  }

  // 3) Identifier le candidat
  const cands = name ? await findCandidats(name, client.entrepriseId) : [];
  if (cands.length !== 1) {
    const why = !name ? 'candidat non identifié' : cands.length === 0 ? `candidat « ${name} » introuvable` : `${cands.length} candidats « ${name} »`;
    await createDoubtTask(userId, msg, `Push CV vers ${client.nom} — ${why}`, name, client.id);
    return 'doubt';
  }
  const candidat = cands[0];

  // 4) Mandat cible : candidature existante sur un mandat de l'entreprise, sinon mandat ouvert unique
  const existingCandidature = await prisma.candidature.findFirst({
    where: { candidatId: candidat.id, mandat: { entrepriseId: client.entrepriseId } },
    select: { id: true, stage: true, mandatId: true },
  });
  let mandatId: string | null = existingCandidature?.mandatId ?? null;
  if (!mandatId) {
    const openMandats = await prisma.mandat.findMany({
      where: { entrepriseId: client.entrepriseId, statut: { in: ['OUVERT', 'EN_COURS'] } },
      select: { id: true },
    });
    if (openMandats.length === 1) mandatId = openMandats[0].id;
  }
  if (!mandatId) {
    await createDoubtTask(userId, msg, `Push CV : ${candidat.prenom ?? ''} ${candidat.nom} → ${client.nom} — mandat ambigu`, name, client.id, candidat.id);
    return 'doubt';
  }

  // 5) AUTO : passer la candidature en ENVOYE_CLIENT (push)
  await ensurePushed(userId, candidat.id, mandatId, existingCandidature, msg, client);
  return 'auto';
}

async function ensurePushed(
  userId: string,
  candidatId: string,
  mandatId: string,
  existing: { id: string; stage: string } | null,
  msg: SentMessage,
  client: { id: string; nom: string },
): Promise<void> {
  let candidatureId = existing?.id ?? null;
  const curIdx = existing ? STAGE_ORDER.indexOf(existing.stage) : -1;
  const targetIdx = STAGE_ORDER.indexOf('ENVOYE_CLIENT');

  if (!candidatureId) {
    const created = await prisma.candidature.create({
      data: { candidatId, mandatId, stage: 'ENVOYE_CLIENT' as any, createdById: userId },
      select: { id: true },
    });
    candidatureId = created.id;
    await prisma.stageHistory.create({ data: { candidatureId, fromStage: null, toStage: 'ENVOYE_CLIENT' as any, changedById: userId, changedAt: msg.date } as any });
  } else if (curIdx >= 0 && curIdx < targetIdx) {
    await prisma.candidature.update({ where: { id: candidatureId }, data: { stage: 'ENVOYE_CLIENT' as any } });
    await prisma.stageHistory.create({ data: { candidatureId, fromStage: existing!.stage as any, toStage: 'ENVOYE_CLIENT' as any, changedById: userId, changedAt: msg.date } as any });
  }
  // else : déjà à ENVOYE_CLIENT ou au-delà → on log seulement l'activité de push.

  // Activité de push (idempotence + trace) sur le candidat.
  await prisma.activite.create({
    data: {
      type: 'EMAIL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: candidatId, userId,
      titre: `Push CV envoyé à ${client.nom}`,
      contenu: msg.subject || '', source: 'GMAIL',
      metadata: { pushGmailMessageId: msg.id, push: true, auto: true, clientId: client.id, mandatId, attachment: msg.attachments[0] || null },
    },
  });
  // Trace côté client également.
  await prisma.activite.create({
    data: {
      type: 'EMAIL', direction: 'SORTANT', entiteType: 'CLIENT', entiteId: client.id, userId,
      titre: `CV envoyé (push)`, contenu: msg.subject || '', source: 'GMAIL',
      metadata: { pushGmailMessageId: msg.id, push: true, candidatId, mandatId },
    },
  });
  console.log(`[PushDetect] AUTO push: candidat ${candidatId} → ${client.nom} (mandat ${mandatId})`);
}

// « Notif ATS » = tâche pour le recruteur (les notifs in-app sont retirées).
async function createDoubtTask(
  userId: string, msg: SentMessage, titre: string, name: string, clientId: string | null, candidatId?: string,
): Promise<void> {
  await prisma.activite.create({
    data: {
      type: 'TACHE', isTache: true,
      entiteType: candidatId ? 'CANDIDAT' : clientId ? 'CLIENT' : 'CANDIDAT',
      entiteId: candidatId ?? clientId ?? '00000000-0000-0000-0000-000000000000',
      userId,
      titre: `📎 ${titre}`,
      contenu: `Push CV détecté (pièce : ${msg.attachments[0] || '—'}, sujet : « ${msg.subject} »). À rattacher au bon candidat/mandat.`,
      tacheDueDate: new Date(),
      source: 'GMAIL',
      metadata: { pushGmailMessageId: msg.id, push: 'doubt', extractedName: name || null, clientId, candidatId: candidatId ?? null },
    },
  });
  console.log(`[PushDetect] DOUBT task: ${titre}`);
}

// ─── Entrée par user + globale ──────────────────────
export async function detectPushesForUser(userId: string): Promise<{ auto: number; doubt: number }> {
  const res = { auto: 0, doubt: 0 };
  const token = await getValidAccessToken(userId);
  if (!token) return res;
  const config = await prisma.integrationConfig.findUnique({ where: { userId_provider: { userId, provider: 'gmail' } } });
  if (!config || !config.enabled) return res;
  const cfg = (config.config as Record<string, any>) || {};
  const since = cfg.lastPushDetectCheck ? new Date(cfg.lastPushDetectCheck) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const self = (cfg.email || '').toLowerCase();

  try {
    const msgs = await fetchSentPushes(token, since, self);
    for (const m of msgs) {
      try {
        const r = await processPush(m, userId);
        if (r === 'auto') res.auto++;
        else if (r === 'doubt') res.doubt++;
      } catch (e) {
        console.error(`[PushDetect] processPush ${m.id} failed:`, e);
      }
    }
  } finally {
    await prisma.integrationConfig.update({
      where: { id: config.id },
      data: { config: { ...cfg, lastPushDetectCheck: new Date().toISOString() } },
    });
  }
  if (res.auto || res.doubt) console.log(`[PushDetect] user ${userId}: ${res.auto} auto, ${res.doubt} à confirmer`);
  return res;
}

export async function detectAllPushes(): Promise<void> {
  const configs = await prisma.integrationConfig.findMany({ where: { provider: 'gmail', enabled: true }, select: { userId: true } });
  for (const c of configs) {
    try { await detectPushesForUser(c.userId); }
    catch (e) { console.error(`[PushDetect] user ${c.userId} failed:`, e); }
  }
}
