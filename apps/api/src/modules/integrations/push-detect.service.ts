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
import { isPersonalEmail } from './allo.service.js';

const deriveCompanyName = (domain: string): string => {
  const n = domain.replace(/^www\./, '').split('.')[0];
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : domain;
};
// "Prénom Nom <a@b.fr>" → { prenom, nom }
function parseContactName(raw: string, email: string): { prenom: string | null; nom: string } {
  const disp = (raw.replace(/<[^>]+>/, '').replace(/["']/g, '').trim());
  if (disp && /[A-Za-zÀ-ÿ]{2,}/.test(disp)) {
    const parts = disp.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return { prenom: parts[0], nom: parts.slice(1).join(' ') };
    return { prenom: null, nom: disp };
  }
  // fallback : partie locale de l'email ("prenom.nom@…")
  const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  const parts = local.split(/\s+/).filter((w) => w.length >= 2);
  if (parts.length >= 2) return { prenom: parts[0].charAt(0).toUpperCase() + parts[0].slice(1), nom: parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') };
  return { prenom: null, nom: local || email };
}

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
  to: string[];      // emails normalisés
  toRaw: string[];   // entrées brutes "Nom <email>"
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
        const toRaw = (headers['to'] || '').split(',').map((s) => s.trim()).filter(Boolean);
        const to = toRaw.map(emailOf).filter(Boolean);
        out.push({ id, to, toRaw, subject: headers['subject'] || '', date: headers['date'] ? new Date(headers['date']) : new Date(), attachments: docs, snippet: d.snippet || '' });
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
    .replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, '$1 $2') // "PatriciaPerez" → "Patricia Perez"
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

// Entreprise connue par le domaine du destinataire (sinon null = société inconnue).
async function findEntrepriseByDomain(domain: string): Promise<{ id: string; nom: string } | null> {
  const base = domain.replace(/^www\./, '').toLowerCase();
  if (!base || base.split('.')[0].length < 3) return null;
  return prisma.entreprise.findFirst({
    where: { OR: [{ domaine: { contains: base, mode: 'insensitive' } }, { siteWeb: { contains: base, mode: 'insensitive' } }] },
    select: { id: true, nom: true },
  });
}

interface PushTarget { clientId: string | null; entrepriseId: string; nom: string }

// Résout la cible d'un push : Client exact → Entreprise connue par domaine →
// sinon CRÉE l'entreprise (depuis le domaine) + le prospect (Client statut LEAD).
// Renvoie null si aucun destinataire pro exploitable (emails perso uniquement).
async function resolveTarget(
  recips: Array<{ email: string; raw: string }>, userId: string,
): Promise<{ target: PushTarget; created: boolean } | null> {
  // 1) Client exact
  for (const r of recips) {
    const m = await matchEmail(r.email);
    if (m?.type === 'CLIENT') {
      const c = await prisma.client.findUnique({ where: { id: m.id }, select: { id: true, nom: true, entrepriseId: true } });
      if (c) return { target: { clientId: c.id, entrepriseId: c.entrepriseId, nom: c.nom }, created: false };
    }
  }
  // 2) Entreprise connue par domaine (contact non précis)
  for (const r of recips) {
    const e = await findEntrepriseByDomain(r.email.split('@')[1] || '');
    if (e) return { target: { clientId: null, entrepriseId: e.id, nom: e.nom }, created: false };
  }
  // 3) Société inconnue → créer Entreprise + prospect depuis le 1er destinataire pro
  for (const r of recips) {
    if (isPersonalEmail(r.email)) continue;
    const domain = (r.email.split('@')[1] || '').toLowerCase().replace(/^www\./, '');
    if (!domain || domain.split('.')[0].length < 2) continue;
    let ent = await prisma.entreprise.findFirst({ where: { domaine: { equals: domain, mode: 'insensitive' } }, select: { id: true, nom: true } });
    if (!ent) {
      ent = await prisma.entreprise.create({
        data: { nom: deriveCompanyName(domain), domaine: domain, siteWeb: `https://${domain}`, notes: 'Créée automatiquement depuis un push CV' },
        select: { id: true, nom: true },
      });
    }
    let cli = await prisma.client.findFirst({ where: { email: { equals: r.email, mode: 'insensitive' } }, select: { id: true } });
    if (!cli) {
      const nm = parseContactName(r.raw, r.email);
      cli = await prisma.client.create({
        data: { nom: nm.nom, prenom: nm.prenom ?? undefined, email: r.email, entrepriseId: ent.id, statutClient: 'LEAD', typeClient: 'OUTBOUND', createdById: userId, notes: 'Prospect créé automatiquement depuis un push CV' },
        select: { id: true },
      });
      console.log(`[PushDetect] Société+prospect créés: ${ent.nom} / ${nm.prenom ?? ''} ${nm.nom} <${r.email}>`);
    }
    return { target: { clientId: cli.id, entrepriseId: ent.id, nom: ent.nom }, created: true };
  }
  return null;
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
  if (!looksLikePush) { console.log(`[PushDetect] skip ${msg.id}: pas un CV (PJ=${msg.attachments.join(',')} · sujet="${msg.subject}")`); return 'skip'; }

  // 1) Destinataires externes (on ignore les emails internes), avec leur entrée brute (nom).
  const recips = msg.to
    .map((email, i) => ({ email, raw: msg.toRaw[i] || email }))
    .filter((r) => r.email && !r.email.endsWith('@humanup.io'));
  if (!recips.length) { console.log(`[PushDetect] skip ${msg.id}: destinataires internes (${msg.to.join(',')})`); return 'skip'; }

  // 2) Cible = Client exact, sinon Entreprise connue par domaine, sinon on CRÉE société + prospect.
  const resolved = await resolveTarget(recips, userId);
  if (!resolved) { console.log(`[PushDetect] skip ${msg.id}: aucun destinataire pro (${recips.map((r) => r.email).join(',')})`); return 'skip'; }
  const { target, created } = resolved;

  const name = extractCandidateName(msg.attachments, msg.subject);
  const cands = name ? await findCandidats(name, target.entrepriseId) : [];

  // 3) Société tout juste créée : pas encore de mandat → on notifie (tâche) + trace, pas d'auto.
  if (created) {
    const candLabel = cands.length === 1 ? `${cands[0].prenom ?? ''} ${cands[0].nom}`.trim() : name || 'candidat à préciser';
    await createDoubtTask(userId, msg, `Push CV → ${target.nom} (nouvelle société + prospect créés) — ${candLabel}`, name, target.clientId, cands.length === 1 ? cands[0].id : undefined);
    if (cands.length === 1) {
      await prisma.activite.create({ data: { type: 'EMAIL', direction: 'SORTANT', entiteType: 'CANDIDAT', entiteId: cands[0].id, userId, titre: `Push CV envoyé à ${target.nom}`, contenu: msg.subject || '', source: 'GMAIL', metadata: { pushGmailMessageId: msg.id, push: true, clientId: target.clientId, entrepriseId: target.entrepriseId, attachment: msg.attachments[0] || null } } });
    }
    return 'doubt';
  }

  // 4) Société connue : identifier le candidat
  if (cands.length !== 1) {
    const why = !name ? 'candidat non identifié' : cands.length === 0 ? `candidat « ${name} » introuvable` : `${cands.length} candidats « ${name} »`;
    await createDoubtTask(userId, msg, `Push CV vers ${target.nom} — ${why}`, name, target.clientId);
    return 'doubt';
  }
  const candidat = cands[0];

  // 4) Mandat cible : candidature existante sur un mandat de l'entreprise, sinon mandat ouvert unique
  const existingCandidature = await prisma.candidature.findFirst({
    where: { candidatId: candidat.id, mandat: { entrepriseId: target.entrepriseId } },
    select: { id: true, stage: true, mandatId: true },
  });
  let mandatId: string | null = existingCandidature?.mandatId ?? null;
  if (!mandatId) {
    const openMandats = await prisma.mandat.findMany({
      where: { entrepriseId: target.entrepriseId, statut: { in: ['OUVERT', 'EN_COURS'] } },
      select: { id: true },
    });
    if (openMandats.length === 1) mandatId = openMandats[0].id;
  }
  if (!mandatId) {
    await createDoubtTask(userId, msg, `Push CV : ${candidat.prenom ?? ''} ${candidat.nom} → ${target.nom} — mandat ambigu`, name, target.clientId, candidat.id);
    return 'doubt';
  }

  // 5) AUTO : passer la candidature en ENVOYE_CLIENT (push)
  await ensurePushed(userId, candidat.id, mandatId, existingCandidature, msg, target);
  return 'auto';
}

async function ensurePushed(
  userId: string,
  candidatId: string,
  mandatId: string,
  existing: { id: string; stage: string } | null,
  msg: SentMessage,
  target: PushTarget,
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
      titre: `Push CV envoyé à ${target.nom}`,
      contenu: msg.subject || '', source: 'GMAIL',
      metadata: { pushGmailMessageId: msg.id, push: true, auto: true, clientId: target.clientId, entrepriseId: target.entrepriseId, mandatId, attachment: msg.attachments[0] || null },
    },
  });
  // Trace côté client si un contact client précis est identifié.
  if (target.clientId) {
    await prisma.activite.create({
      data: {
        type: 'EMAIL', direction: 'SORTANT', entiteType: 'CLIENT', entiteId: target.clientId, userId,
        titre: `CV envoyé (push)`, contenu: msg.subject || '', source: 'GMAIL',
        metadata: { pushGmailMessageId: msg.id, push: true, candidatId, mandatId },
      },
    });
  }
  console.log(`[PushDetect] AUTO push: candidat ${candidatId} → ${target.nom} (mandat ${mandatId})`);
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
    console.log(`[PushDetect] user ${userId}: ${msgs.length} messages candidats récupérés (since ${since.toISOString()})`);
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
