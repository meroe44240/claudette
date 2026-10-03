// Espace candidat : comptes, invitation après le premier call, activation,
// connexion, et la vue du candidat sur ses process.
import { SignJWT, jwtVerify } from 'jose';
import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError, UnauthorizedError, ConflictError } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { callClaude } from '../../services/claudeAI.js';
import { translateTexts } from '../ai/translate.service.js';
import { sendEmail } from '../../lib/mailer.js';
import { sendCandidateEmail, escapeHtml as esc } from './candidate-space.emails.js';
import {
  EXPECTATION_FIELDS, SUMMARY_FIELDS, asProfile, cleanExpectations, cleanOtherProcesses,
  type CandidateProfile, type OtherProcess,
} from './candidate-space.fields.js';

const BASE = process.env.PORTAL_BASE_URL || 'https://ats.propium.co';
const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET || 'dev-access-secret');

// Étapes où l'on a un poste à proposer au candidat (condition d'ouverture de l'espace).
const ACTIVE_STAGES = ['CONTACTE', 'ENTRETIEN_1', 'ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'PROCESS', 'OFFRE'];
// À partir d'ici, le profil a été présenté : le nom du client est visible.
const PRESENTED_STAGES = ['ENVOYE_CLIENT', 'ENTRETIEN_CLIENT', 'PROCESS', 'OFFRE', 'PLACE'];
// Étapes affichées au candidat, dans l'ordre (Sourcing n'est jamais montré).
export const CANDIDATE_STEPS: Array<{ stage: string; label: string }> = [
  { stage: 'CONTACTE', label: 'Call with Humanup' },
  { stage: 'ENTRETIEN_1', label: 'Interview with Humanup' },
  { stage: 'ENVOYE_CLIENT', label: 'Profile presented' },
  { stage: 'ENTRETIEN_CLIENT', label: 'Interview with the company' },
  { stage: 'PROCESS', label: 'Final interviews' },
  { stage: 'OFFRE', label: 'Offer' },
  { stage: 'PLACE', label: 'Hired' },
];
const STEP_LABEL: Record<string, string> = Object.fromEntries(CANDIDATE_STEPS.map((s) => [s.stage, s.label]));
// Libellé d'étape en milieu de phrase : minuscules, sauf le nom Humanup.
const lowerStep = (label: string) => label.toLowerCase().replace('humanup', 'Humanup');

const fullName = (u: { prenom?: string | null; nom?: string | null } | null | undefined) =>
  `${u?.prenom ? u.prenom + ' ' : ''}${u?.nom ?? ''}`.trim();
const firstName = (c: { prenom?: string | null; nom?: string | null }) => (c.prenom || c.nom || '').trim();

// ── Jetons ───────────────────────────────────────────
interface CandidateSession { sub: string; cid: string; type: 'candidate' }

async function sign(payload: Record<string, unknown>, exp: string) {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(exp).sign(secret);
}
async function verify<T>(token: string, type: string): Promise<T> {
  try {
    const { payload } = await jwtVerify(token, secret);
    if ((payload as any).type !== type) throw new Error('type');
    return payload as unknown as T;
  } catch {
    throw new UnauthorizedError('This link is invalid or has expired.');
  }
}
async function sessionToken(account: { id: string; candidatId: string }) {
  return sign({ sub: account.id, cid: account.candidatId, type: 'candidate' }, '30d');
}

/** Vérifie un jeton de session candidat et renvoie le compte (actif, non révoqué). */
export async function authenticateCandidate(token: string) {
  const p = await verify<CandidateSession>(token, 'candidate');
  const account = await prisma.candidateAccount.findUnique({ where: { id: p.sub } });
  if (!account || account.revokedAt || !account.activatedAt) throw new UnauthorizedError('Your session has expired. Please sign in again.');
  return account;
}

function checkPassword(pw: string) {
  if (typeof pw !== 'string' || pw.length < 10) throw new ValidationError('Your password needs at least 10 characters.');
}

// ── Équipe Humanup du candidat ───────────────────────
async function teamFor(candidatId: string, invitedById: string | null) {
  const cands = await prisma.candidature.findMany({
    where: { candidatId, stage: { notIn: ['SOURCING'] as any } },
    orderBy: { updatedAt: 'desc' },
    select: { mandat: { select: { recruteurId: true, assignedToId: true, sourceurId: true } } },
  });
  const order: Array<{ id: string; role: string }> = [];
  const push = (id: string | null | undefined, role: string) => { if (id && !order.some((o) => o.id === id)) order.push({ id, role }); };
  for (const c of cands) push(c.mandat.recruteurId ?? c.mandat.assignedToId, 'Recruiter');
  push(invitedById, 'Recruiter');
  for (const c of cands) push(c.mandat.sourceurId, 'Talent Acquisition Manager');
  const ids = order.slice(0, 2).map((o) => o.id);
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, prenom: true, nom: true, email: true, avatarUrl: true, telephone: true } });
  return ids
    .map((id) => {
      const u = users.find((x) => x.id === id);
      if (!u) return null;
      return {
        id: u.id,
        name: fullName(u) || u.email,
        firstName: u.prenom || fullName(u),
        role: order.find((o) => o.id === id)!.role,
        email: u.email,
        avatarUrl: typeof u.avatarUrl === 'string' && u.avatarUrl.startsWith('http') ? u.avatarUrl : null,
      };
    })
    .filter(Boolean) as Array<{ id: string; name: string; firstName: string; role: string; email: string; avatarUrl: string | null }>;
}

function signatureOf(team: Array<{ firstName: string }>) {
  const names = team.map((t) => t.firstName).filter(Boolean);
  return names.length ? names.join(' and ') : 'Your Humanup team';
}

// ── Côté recruteur ───────────────────────────────────
/** Brouillon de feedback au candidat à partir du retour du client sur le portail (motif d'écart, débrief). À relire avant envoi. */
function feedbackDraft(c: { motifRefus: unknown; motifRefusDetail: string | null; portalDebrief: unknown }): string | null {
  const d = (c.portalDebrief ?? null) as { strengths?: string | null; concerns?: string | null } | null;
  const reason = c.motifRefus === 'CLIENT_REFUSE' ? c.motifRefusDetail?.trim() : null;
  const parts: string[] = [];
  if (reason) parts.push(`Le client n'a pas retenu ton profil pour ce poste. Son retour : ${reason}`);
  if (d?.strengths?.trim()) parts.push(`Ce qu'il a apprécié : ${d.strengths.trim()}`);
  if (d?.concerns?.trim() && d.concerns.trim() !== reason) parts.push(`Ses réserves : ${d.concerns.trim()}`);
  return parts.length ? parts.join('\n') : null;
}

export async function getStatus(candidatId: string) {
  const [candidat, account, cands] = await Promise.all([
    prisma.candidat.findUnique({ where: { id: candidatId }, select: { id: true, email: true } }),
    prisma.candidateAccount.findUnique({ where: { candidatId } }),
    prisma.candidature.findMany({
      where: { candidatId },
      select: {
        id: true, stage: true, motifRefus: true, motifRefusDetail: true, portalDebrief: true,
        mandat: { select: { titrePoste: true, entreprise: { select: { nom: true } } } },
        stageHistory: { orderBy: { changedAt: 'desc' }, take: 1, select: { toStage: true, candidateMessage: true } },
      },
    }),
  ]);
  if (!candidat) throw new NotFoundError('Candidat', candidatId);
  const active = cands.filter((c) => ACTIVE_STAGES.includes(c.stage));
  // Refus sans message : invisibles pour le candidat tant que le feedback n'est pas écrit.
  const feedbackMissing = cands
    .filter((c) => c.stage === 'REFUSE' && c.stageHistory[0]?.toStage === 'REFUSE' && !c.stageHistory[0]?.candidateMessage)
    .map((c) => ({ candidatureId: c.id, titre: c.mandat.titrePoste, entreprise: c.mandat.entreprise?.nom ?? null, suggestion: feedbackDraft(c) }));
  return {
    canOpen: !!candidat.email && active.length > 0,
    blocker: !candidat.email ? 'Ajoute un email au candidat.' : active.length === 0 ? 'Il faut au moins un poste en cours (Qualification à Offre).' : null,
    account: account
      ? {
          email: account.email, profile: account.profile,
          invitedAt: account.invitedAt, activatedAt: account.activatedAt, lastLoginAt: account.lastLoginAt, revokedAt: account.revokedAt,
        }
      : null,
    feedbackMissing,
  };
}

function gatherSources(candidatId: string) {
  return prisma.activite.findMany({
    where: { entiteType: 'CANDIDAT', entiteId: candidatId, type: { in: ['APPEL', 'TRANSCRIPT', 'MEETING', 'NOTE'] as any } },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { type: true, titre: true, contenu: true, metadata: true, createdAt: true },
  });
}

/** Pré-remplit profil, attentes et autres process à partir de la fiche et des derniers calls. */
export async function prefill(candidatId: string, userId: string) {
  const c = await prisma.candidat.findUnique({ where: { id: candidatId } });
  if (!c) throw new NotFoundError('Candidat', candidatId);
  const existing = await prisma.candidateAccount.findUnique({ where: { candidatId } });
  const acts = await gatherSources(candidatId);
  const sources = acts
    .map((a) => {
      const meta = (a.metadata ?? {}) as Record<string, unknown>;
      const txt = (typeof meta.transcript === 'string' && meta.transcript) || a.contenu || '';
      return txt.trim() ? `### ${a.type} ${a.createdAt.toISOString().slice(0, 10)} ${a.titre ?? ''}\n${txt.slice(0, 6000)}` : '';
    })
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 30000);
  const fiche = {
    posteActuel: c.posteActuel, entrepriseActuelle: c.entrepriseActuelle, localisation: c.localisation,
    salaireActuel: c.salaireActuel, salaireSouhaite: c.salaireSouhaite, disponibilite: c.disponibilite,
    mobilite: c.mobilite, anneesExperience: c.anneesExperience, notes: c.notes?.slice(0, 3000) ?? null,
  };
  const fieldsDoc = (Object.keys(EXPECTATION_FIELDS) as CandidateProfile[])
    .map((p) => `${p}: ${EXPECTATION_FIELDS[p].map((f) => `${f.id} (${f.label})`).join(', ')}`)
    .join('\n');

  let result: { profile: CandidateProfile; expectations: Record<string, string>; otherProcesses: OtherProcess[] } = {
    profile: asProfile(existing?.profile),
    expectations: (existing?.expectations as Record<string, string>) ?? {},
    otherProcesses: (existing?.otherProcesses as unknown as OtherProcess[]) ?? [],
  };
  if (sources || Object.values(fiche).some(Boolean)) {
    const systemPrompt = `Tu prépares l'espace candidat d'un cabinet de recrutement. À partir de la fiche et des transcripts d'appels, tu remplis les attentes du candidat.
Réponds UNIQUEMENT en JSON : {"profile":"TECH"|"SALES","expectations":{...},"otherProcesses":[{"company":"","stage":"","deadline":""}]}.
- profile : SALES pour un commercial (AE, SDR, account manager, sales manager...), sinon TECH.
- expectations : uniquement les clés du profil choisi :
${fieldsDoc}
- Valeurs en ANGLAIS, courtes (ex. "$230K minimum", "Hybrid, NYC", "4 weeks notice").
- N'invente rien : une information absente des sources = clé omise.
- otherProcesses : les autres process de recrutement en cours que le candidat a mentionnés (entreprise, étape, échéance), sinon [].`;
    try {
      const r = await callClaude({
        feature: 'candidate_space_prefill',
        systemPrompt,
        userPrompt: `FICHE\n${JSON.stringify(fiche)}\n\nSOURCES\n${sources || '(aucune)'}`,
        userId,
        maxTokens: 2000,
        temperature: 0,
      });
      const j = (typeof r.content === 'object' && r.content ? r.content : JSON.parse((r.rawText.match(/\{[\s\S]*\}/) || ['{}'])[0])) as Record<string, unknown>;
      const profile = asProfile(j.profile);
      result = {
        profile,
        expectations: { ...cleanExpectations(profile, result.expectations), ...cleanExpectations(profile, j.expectations) },
        otherProcesses: cleanOtherProcesses(j.otherProcesses).length ? cleanOtherProcesses(j.otherProcesses) : result.otherProcesses,
      };
    } catch (e) {
      console.warn('[Espace candidat] pré-remplissage IA impossible', (e as Error).message);
    }
  }
  return { ...result, fields: EXPECTATION_FIELDS, hasSources: !!sources };
}

/** Ouvre (ou ré-ouvre) l'espace et envoie l'invitation. */
export async function invite(candidatId: string, userId: string, input: { profile: unknown; expectations: unknown; otherProcesses: unknown }) {
  const status = await getStatus(candidatId);
  if (!status.canOpen) throw new ValidationError(status.blocker ?? 'Espace impossible à ouvrir');
  const c = await prisma.candidat.findUnique({
    where: { id: candidatId },
    select: {
      id: true, prenom: true, nom: true, email: true,
      candidatures: {
        where: { stage: { in: ACTIVE_STAGES as any } },
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { stage: true, mandat: { select: { titrePoste: true, localisation: true, entreprise: { select: { nom: true } } } } },
      },
    },
  });
  if (!c?.email) throw new ValidationError('Ajoute un email au candidat.');
  const email = c.email.trim().toLowerCase();
  const other = await prisma.candidateAccount.findUnique({ where: { email } });
  if (other && other.candidatId !== candidatId) throw new ConflictError('Cet email a déjà un espace candidat sur une autre fiche.');

  const profile = asProfile(input.profile);
  const data = {
    email,
    profile,
    expectations: cleanExpectations(profile, input.expectations),
    otherProcesses: cleanOtherProcesses(input.otherProcesses) as any,
    invitedAt: new Date(),
    invitedById: userId,
  };
  const existing = await prisma.candidateAccount.findUnique({ where: { candidatId } });
  if (existing?.activatedAt && !existing.revokedAt) throw new ConflictError('Le candidat a déjà activé son espace.');
  const account = existing
    // Ré-ouverture après une coupure d'accès : on repart de zéro (nouvelle activation, nouveau mot de passe).
    ? await prisma.candidateAccount.update({
        where: { id: existing.id },
        data: { ...data, revokedAt: null, activatedAt: null, passwordHash: null, consentAt: null, activationVersion: { increment: 1 } },
      })
    : await prisma.candidateAccount.create({ data: { candidatId, ...data } });

  const token = await sign({ sub: account.id, v: account.activationVersion, type: 'candidate_activation' }, '7d');
  const link = `${BASE}/espace/activer?token=${encodeURIComponent(token)}`;
  const team = await teamFor(candidatId, userId);
  const first = c.candidatures[0];
  const presented = first && PRESENTED_STAGES.includes(first.stage);
  const roleLine = first
    ? `<b>${esc(first.mandat.titrePoste)}</b>${presented && first.mandat.entreprise?.nom ? ` at ${esc(first.mandat.entreprise.nom)}` : ', a confidential client'}${first.mandat.localisation ? ` in ${esc(first.mandat.localisation)}` : ''}`
    : null;
  let emailSent = true;
  await sendCandidateEmail(userId, email, `Your Humanup space is ready, ${firstName(c)}`, {
    paragraphs: [
      `Hi ${esc(firstName(c))},`,
      `Great talking to you. We set up a private space for you, with what we noted during our call${roleLine ? ` and a first role we would like to put you forward for: ${roleLine}` : ''}.`,
      'Check that everything is right and choose a password. It takes two minutes.',
    ],
    cta: { label: 'Open my space', href: link },
    note: 'This link works once and for 7 days.',
    signature: signatureOf(team),
  }).catch((e) => {
    // L'espace est ouvert quand même : le recruteur peut envoyer le lien lui-même.
    emailSent = false;
    console.warn("[Espace candidat] email d'invitation non envoyé", (e as Error).message);
  });
  await prisma.activite.create({
    data: {
      type: 'NOTE', titre: 'Espace candidat : invitation envoyée', entiteType: 'CANDIDAT', entiteId: candidatId,
      userId, source: 'SYSTEME', metadata: { candidateSpace: 'invite', email, emailSent },
    },
  });
  return { ok: true, invitedAt: account.invitedAt, emailSent, link: emailSent ? null : link };
}

export async function revoke(candidatId: string) {
  const account = await prisma.candidateAccount.findUnique({ where: { candidatId } });
  if (!account) throw new NotFoundError('Espace candidat', candidatId);
  await prisma.candidateAccount.update({ where: { id: account.id }, data: { revokedAt: new Date(), activationVersion: { increment: 1 } } });
  return { ok: true };
}

// ── Activation, connexion, mot de passe ──────────────
async function accountFromActivation(token: string) {
  const p = await verify<{ sub: string; v: number }>(token, 'candidate_activation');
  const account = await prisma.candidateAccount.findUnique({ where: { id: p.sub } });
  if (!account || account.revokedAt || account.activationVersion !== p.v) throw new UnauthorizedError('This link is no longer valid. Ask your Humanup team for a new one.');
  if (account.activatedAt) throw new ConflictError('Your space is already active. Sign in with your email and password.');
  return account;
}

export async function activationContext(token: string) {
  const account = await accountFromActivation(token);
  const c = await prisma.candidat.findUnique({ where: { id: account.candidatId }, select: { prenom: true, nom: true } });
  const profile = asProfile(account.profile);
  return {
    firstName: firstName(c ?? {}),
    name: fullName(c),
    email: account.email,
    profile,
    fields: EXPECTATION_FIELDS[profile],
    expectations: account.expectations,
    otherProcesses: account.otherProcesses,
    team: await teamFor(account.candidatId, account.invitedById),
  };
}

export async function activate(input: { token: string; password: string; consent: boolean; expectations?: unknown; otherProcesses?: unknown }) {
  const account = await accountFromActivation(input.token);
  if (!input.consent) throw new ValidationError('Please accept the privacy policy.');
  checkPassword(input.password);
  const profile = asProfile(account.profile);
  const before = JSON.stringify([account.expectations, account.otherProcesses]);
  const expectations = input.expectations !== undefined ? cleanExpectations(profile, input.expectations) : account.expectations;
  const otherProcesses = input.otherProcesses !== undefined ? cleanOtherProcesses(input.otherProcesses) : account.otherProcesses;
  const now = new Date();
  const updated = await prisma.candidateAccount.update({
    where: { id: account.id },
    data: {
      passwordHash: await hashPassword(input.password), activatedAt: now, consentAt: now, lastLoginAt: now,
      expectations: expectations as any, otherProcesses: otherProcesses as any,
    },
  });
  await prisma.candidat.update({ where: { id: account.candidatId }, data: { consentementRgpd: true, consentementDate: now } });
  const changed = JSON.stringify([updated.expectations, updated.otherProcesses]) !== before;
  await logAndNotify(account.candidatId, account.invitedById, changed ? 'Espace candidat activé, attentes corrigées par le candidat' : 'Espace candidat activé, attentes confirmées');
  return { token: await sessionToken(updated) };
}

export async function login(email: string, password: string) {
  const account = await prisma.candidateAccount.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!account || !account.passwordHash || account.revokedAt || !account.activatedAt || !(await verifyPassword(password, account.passwordHash))) {
    throw new UnauthorizedError('Wrong email or password.');
  }
  await prisma.candidateAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });
  return { token: await sessionToken(account) };
}

export async function requestPasswordReset(email: string) {
  const account = await prisma.candidateAccount.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!account || !account.passwordHash || account.revokedAt) return;
  const token = await sign({ sub: account.id, ph: account.passwordHash.slice(-12), type: 'candidate_reset' }, '1h');
  const c = await prisma.candidat.findUnique({ where: { id: account.candidatId }, select: { prenom: true, nom: true } });
  const team = await teamFor(account.candidatId, account.invitedById);
  await sendCandidateEmail(null, account.email, 'Choose a new password', {
    paragraphs: [
      `Hi ${esc(firstName(c ?? {}))},`,
      'You asked for a new password for your Humanup space. Click below to choose one. The link works for one hour.',
      'You did not ask for this? Ignore this email, your password stays the same.',
    ],
    cta: { label: 'Choose a new password', href: `${BASE}/espace/reinitialiser?token=${encodeURIComponent(token)}` },
    signature: signatureOf(team),
  });
}

export async function confirmPasswordReset(token: string, password: string) {
  const p = await verify<{ sub: string; ph: string }>(token, 'candidate_reset');
  const account = await prisma.candidateAccount.findUnique({ where: { id: p.sub } });
  if (!account || !account.passwordHash || account.revokedAt || account.passwordHash.slice(-12) !== p.ph) {
    throw new UnauthorizedError('This link is no longer valid. Ask for a new one.');
  }
  checkPassword(password);
  const updated = await prisma.candidateAccount.update({ where: { id: account.id }, data: { passwordHash: await hashPassword(password), lastLoginAt: new Date() } });
  return { token: await sessionToken(updated) };
}

// ── Vue du candidat ──────────────────────────────────
type CandidatureView = Awaited<ReturnType<typeof loadCandidatures>>[number];

function loadCandidatures(candidatId: string) {
  return prisma.candidature.findMany({
    where: { candidatId, stage: { not: 'SOURCING' as any } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, stage: true, dateEntretienClient: true, interlocuteurClient: true, updatedAt: true, portalSlots: true,
      mandat: { select: { titrePoste: true, localisation: true, entreprise: { select: { nom: true } } } },
      stageHistory: { orderBy: { changedAt: 'asc' }, select: { id: true, fromStage: true, toStage: true, changedAt: true, changedById: true, candidateMessage: true, candidateMessageEn: true } },
    },
  });
}

/**
 * Étape vue par le candidat. Un refus sans message validé n'est pas annoncé : le process
 * reste sur sa dernière étape, mais « pending » retire l'entretien à venir et annonce
 * une mise à jour, pour ne pas laisser croire qu'un entretien aura lieu.
 */
function candidateState(c: CandidatureView) {
  const last = c.stageHistory[c.stageHistory.length - 1];
  if (c.stage === 'REFUSE') {
    const refusal = [...c.stageHistory].reverse().find((h) => h.toStage === 'REFUSE');
    const prev = refusal?.fromStage && refusal.fromStage !== 'SOURCING' ? refusal.fromStage : 'CONTACTE';
    if (refusal?.candidateMessage) return { stage: 'REFUSE', closed: true, closedAt: refusal.changedAt, pending: false, lastStage: prev };
    return { stage: prev, closed: false, closedAt: null, pending: true, lastStage: prev };
  }
  return { stage: c.stage, closed: false, closedAt: last?.changedAt ?? null, pending: false, lastStage: c.stage };
}

function viewOf(c: CandidatureView) {
  const st = candidateState(c);
  const presented = PRESENTED_STAGES.includes(st.stage) || c.stageHistory.some((h) => PRESENTED_STAGES.includes(h.toStage));
  const reached = new Map<string, Date>();
  for (const h of c.stageHistory) if (STEP_LABEL[h.toStage] && !reached.has(h.toStage)) reached.set(h.toStage, h.changedAt);
  // Date affichée pour une étape terminée : le jour où le candidat en est sorti, pas celui où il y est entré.
  const left = new Map<string, Date>();
  for (const h of c.stageHistory) if (h.fromStage && h.toStage !== 'REFUSE' && !left.has(h.fromStage)) left.set(h.fromStage, h.changedAt);
  const currentIdx = CANDIDATE_STEPS.findIndex((s) => s.stage === st.stage);
  const lastIdx = CANDIDATE_STEPS.findIndex((s) => s.stage === st.lastStage);
  const steps = CANDIDATE_STEPS.filter((s) => s.stage !== 'PLACE' || st.stage === 'PLACE').map((s, i) => ({
    stage: s.stage, label: s.label,
    // Process clos : l'étape où il s'est arrêté n'est pas « faite », elle est « stopped ».
    state: st.closed ? (i === lastIdx ? 'stopped' : i < lastIdx ? 'done' : 'todo') : i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'todo',
    date: st.closed && i >= lastIdx ? (i === lastIdx ? st.closedAt : null) : reached.has(s.stage) ? left.get(s.stage) ?? reached.get(s.stage)! : null,
  }));
  const feedback = c.stageHistory
    .filter((h) => h.candidateMessage)
    .map((h) => ({
      date: h.changedAt,
      step: h.toStage === 'REFUSE' ? 'Process closed' : STEP_LABEL[h.toStage] ?? h.toStage,
      text: h.candidateMessageEn || h.candidateMessage,
      authorId: h.changedById,
    }))
    .reverse();
  const next = !st.pending && st.stage === 'ENTRETIEN_CLIENT' && c.dateEntretienClient && c.dateEntretienClient.getTime() > Date.now()
    ? { kind: 'Interview with the company', date: c.dateEntretienClient }
    : null;
  // Créneaux proposés par l'entreprise : le candidat en choisit un tant qu'aucun n'est retenu.
  const proposal = (c.portalSlots ?? null) as { slots?: string[]; chosen?: string | null } | null;
  const openSlots = !st.pending && st.stage === 'ENVOYE_CLIENT' && proposal && !proposal.chosen
    ? (proposal.slots ?? []).filter((s) => new Date(s).getTime() > Date.now())
    : [];
  return {
    slotChoice: openSlots.length > 0 ? { slots: openSlots } : null,
    id: c.id,
    title: c.mandat.titrePoste,
    company: presented ? c.mandat.entreprise?.nom ?? null : null,
    confidential: !presented,
    location: c.mandat.localisation,
    stage: st.stage,
    stageLabel: st.closed ? 'Closed' : st.pending ? 'Update coming' : STEP_LABEL[st.stage] ?? 'In progress',
    closed: st.closed,
    pending: st.pending,
    closedAt: st.closedAt,
    hired: st.stage === 'PLACE',
    next,
    steps,
    feedback,
    updatedAt: c.updatedAt,
  };
}

export async function me(account: { id: string; candidatId: string; profile: string; expectations: unknown; otherProcesses: unknown; invitedById: string | null; notifSeenAt: Date | null }) {
  const c = await prisma.candidat.findUnique({ where: { id: account.candidatId }, select: { prenom: true, nom: true } });
  const profile = asProfile(account.profile);
  const exp = (account.expectations ?? {}) as Record<string, string>;
  const fieldLabel = Object.fromEntries(EXPECTATION_FIELDS[profile].map((f) => [f.id, f.label]));
  const others = (account.otherProcesses ?? []) as OtherProcess[];
  const notifications = await notificationsFor(account);
  return {
    firstName: firstName(c ?? {}),
    name: fullName(c),
    profile,
    summary: SUMMARY_FIELDS[profile].filter((id) => exp[id]).map((id) => ({ label: fieldLabel[id], value: exp[id] })),
    otherProcessesCount: others.length,
    team: await teamFor(account.candidatId, account.invitedById),
    unread: notifications.filter((n) => n.unread).length,
  };
}

export async function processes(candidatId: string) {
  const list = await loadCandidatures(candidatId);
  const views = list.map(viewOf).filter((v) => v.stage !== 'SOURCING');
  const open = views.filter((v) => !v.closed);
  const closed = views.filter((v) => v.closed);
  const next = open
    .filter((v) => v.next)
    .sort((a, b) => a.next!.date.getTime() - b.next!.date.getTime())[0] ?? null;
  return { processes: [...open, ...closed], next: next ? { processId: next.id, title: next.title, company: next.company, ...next.next } : null };
}

export async function processDetail(candidatId: string, id: string) {
  const list = await loadCandidatures(candidatId);
  const c = list.find((x) => x.id === id);
  if (!c) throw new NotFoundError('Process', id);
  const v = viewOf(c);
  const authorIds = [...new Set(v.feedback.map((f) => f.authorId).filter(Boolean))] as string[];
  const authors = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, prenom: true, nom: true } });
  return {
    ...v,
    interviewer: v.next && c.interlocuteurClient ? c.interlocuteurClient : null,
    feedback: v.feedback.map((f) => ({ ...f, author: (() => { const a = authors.find((x) => x.id === f.authorId); return a ? a.prenom || fullName(a) : null; })() })),
  };
}

/** Le candidat choisit un des créneaux proposés par l'entreprise : l'entretien est planifié. */
export async function chooseSlot(account: { candidatId: string; invitedById: string | null }, candidatureId: string, slot: string) {
  const c = await prisma.candidature.findUnique({
    where: { id: candidatureId },
    select: {
      id: true, candidatId: true, stage: true, portalSlots: true,
      candidat: { select: { prenom: true, nom: true } },
      mandat: { select: { titrePoste: true, recruteurId: true, assignedToId: true, createdById: true, recruteur: { select: { email: true, prenom: true } }, assignedTo: { select: { email: true, prenom: true } } } },
    },
  });
  if (!c || c.candidatId !== account.candidatId) throw new NotFoundError('Process', candidatureId);
  const proposal = (c.portalSlots ?? null) as { slots?: string[]; who?: string | null; by?: string; byEmail?: string; chosen?: string | null } | null;
  const wanted = new Date(slot).getTime();
  const match = (proposal?.slots ?? []).find((s) => new Date(s).getTime() === wanted);
  if (c.stage !== 'ENVOYE_CLIENT' || !proposal || proposal.chosen || !match || wanted < Date.now()) {
    throw new ValidationError('This time is no longer available. Your Humanup team will get back to you.');
  }
  const actorId = c.mandat.recruteurId ?? c.mandat.assignedToId ?? c.mandat.createdById;
  const { update } = await import('../candidatures/candidature.service.js');
  await update(c.id, { stage: 'ENTRETIEN_CLIENT', dateEntretienClient: match, interlocuteurClient: proposal.who || 'À confirmer' } as any, actorId as string);
  await prisma.candidature.update({ where: { id: c.id }, data: { portalStage: 'SCREENING', portalSlots: { ...proposal, chosen: match } as any } });

  const when = new Date(match).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const name = fullName(c.candidat);
  await prisma.activite.create({
    data: {
      type: 'NOTE', titre: `Espace candidat : ${name} a choisi son créneau d'entretien client (${when}, heure de Paris)`,
      entiteType: 'CANDIDAT', entiteId: c.candidatId, userId: actorId, source: 'SYSTEME', metadata: { candidateSpace: 'slot', candidatureId: c.id },
    } as any,
  });
  const consultant = c.mandat.recruteur ?? c.mandat.assignedTo;
  const html = (hello: string) => `<p>${hello}</p><p><strong>${esc(name)}</strong> a choisi son créneau pour l'entretien (${esc(c.mandat.titrePoste)}) : <strong>${esc(when)}</strong>, heure de Paris${proposal.who ? `, avec ${esc(proposal.who)}` : ''}.</p>`;
  if (consultant?.email) sendEmail(consultant.email, `${name} a choisi son créneau : ${when}`, html(`Bonjour ${esc(consultant.prenom ?? '')},`)).catch(() => {});
  if (proposal.byEmail) sendEmail(proposal.byEmail, `Entretien confirmé avec ${name} : ${when}`, html('Bonjour,')).catch(() => {});
  return processDetail(account.candidatId, c.id);
}

/** Prévient le candidat (espace actif) que l'entreprise propose des créneaux d'entretien. */
export async function notifySlotProposal(candidatureId: string) {
  const c = await prisma.candidature.findUnique({
    where: { id: candidatureId },
    select: { id: true, candidatId: true, candidat: { select: { prenom: true, nom: true } }, mandat: { select: { titrePoste: true } } },
  });
  if (!c) return;
  const account = await prisma.candidateAccount.findUnique({ where: { candidatId: c.candidatId } });
  if (!account || account.revokedAt || !account.activatedAt) return;
  const team = await teamFor(c.candidatId, account.invitedById);
  await sendCandidateEmail(account.invitedById, account.email, 'Choose a time for your interview', {
    paragraphs: [
      `Hi ${esc(firstName(c.candidat))},`,
      `Good news on the <b>${esc(c.mandat.titrePoste)}</b> role: the company would like to meet you and proposed a few times.`,
      'Pick the one that suits you best in your space. The interview is confirmed as soon as you choose.',
    ],
    cta: { label: 'Choose a time', href: `${BASE}/espace/process/${c.id}` },
    signature: signatureOf(team),
  }).catch((e) => console.warn('[Espace candidat] email créneaux', (e as Error).message));
}

export async function getExpectations(account: { profile: string; expectations: unknown; otherProcesses: unknown; updatedAt: Date; email: string }) {
  const profile = asProfile(account.profile);
  return { profile, fields: EXPECTATION_FIELDS[profile], expectations: account.expectations, otherProcesses: account.otherProcesses, updatedAt: account.updatedAt, email: account.email };
}

export async function updateExpectations(account: { id: string; candidatId: string; profile: string; invitedById: string | null }, input: { expectations?: unknown; otherProcesses?: unknown }) {
  const profile = asProfile(account.profile);
  const data: Record<string, unknown> = {};
  if (input.expectations !== undefined) data.expectations = cleanExpectations(profile, input.expectations);
  if (input.otherProcesses !== undefined) data.otherProcesses = cleanOtherProcesses(input.otherProcesses);
  const updated = await prisma.candidateAccount.update({ where: { id: account.id }, data: data as any });
  await logAndNotify(account.candidatId, account.invitedById, 'Espace candidat : attentes ou autres process mis à jour par le candidat');
  return getExpectations(updated);
}

// ── Notifications (fil dérivé des étapes) ────────────
async function notificationsFor(account: { candidatId: string; notifSeenAt: Date | null }) {
  const list = await loadCandidatures(account.candidatId);
  const items: Array<{ id: string; title: string; text: string; date: Date; processId: string; unread: boolean }> = [];
  for (const c of list) {
    const v = viewOf(c);
    const roleName = v.company ? `${v.company}: ${v.title}` : v.title;
    for (const h of c.stageHistory) {
      const visible = h.toStage === 'REFUSE' ? !!h.candidateMessage : !!STEP_LABEL[h.toStage];
      if (!visible) continue;
      const step = h.toStage === 'REFUSE' ? 'process closed' : lowerStep(STEP_LABEL[h.toStage]);
      items.push({
        id: h.id,
        title: `${roleName}, ${step}`,
        text: h.candidateMessageEn || h.candidateMessage || '',
        date: h.changedAt,
        processId: c.id,
        unread: !account.notifSeenAt || h.changedAt > account.notifSeenAt,
      });
    }
  }
  return items.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 50);
}

export async function notifications(account: { id: string; candidatId: string; notifSeenAt: Date | null }) {
  const items = await notificationsFor(account);
  await prisma.candidateAccount.update({ where: { id: account.id }, data: { notifSeenAt: new Date() } });
  return { items };
}

// ── Messages au candidat sur les changements d'étape ─
async function logAndNotify(candidatId: string, invitedById: string | null, titre: string) {
  await prisma.activite.create({
    data: { type: 'NOTE', titre, entiteType: 'CANDIDAT', entiteId: candidatId, userId: invitedById, source: 'SYSTEME', metadata: { candidateSpace: 'update' } },
  });
  const team = await teamFor(candidatId, invitedById);
  const c = await prisma.candidat.findUnique({ where: { id: candidatId }, select: { prenom: true, nom: true } });
  const url = `${BASE}/candidats/${candidatId}`;
  for (const t of team) {
    sendEmail(t.email, `${fullName(c)} : ${titre.replace(/^Espace candidat : /, '')}`, `<p>${esc(fullName(c))} : ${esc(titre)}.</p><p><a href="${url}">Ouvrir la fiche</a></p>`).catch(() => {});
  }
}

/**
 * Appelé après un changement d'étape : traduit le message (français vers anglais),
 * prévient le candidat s'il a un espace actif, et crée une tâche si un refus n'a
 * pas encore de message (le candidat ne le voit pas tant qu'il manque).
 */
export async function onStageChanged(historyId: string, changedById: string) {
  const h = await prisma.stageHistory.findUnique({
    where: { id: historyId },
    select: {
      id: true, toStage: true, candidateMessage: true,
      candidature: { select: { id: true, candidatId: true, mandatId: true, mandat: { select: { titrePoste: true, entreprise: { select: { nom: true } } } } } },
    },
  });
  if (!h) return;
  const account = await prisma.candidateAccount.findUnique({ where: { candidatId: h.candidature.candidatId } });
  if (!account || account.revokedAt) return;

  if (!h.candidateMessage) {
    if (h.toStage === 'REFUSE') {
      await prisma.activite.create({
        data: {
          type: 'TACHE', isTache: true, tacheCompleted: false,
          titre: `Écrire le feedback au candidat (espace candidat) : ${h.candidature.mandat.titrePoste}`,
          entiteType: 'CANDIDAT', entiteId: h.candidature.candidatId, userId: changedById, source: 'SYSTEME',
          tacheDueDate: new Date(Date.now() + 2 * 86400000),
          metadata: { candidateSpace: 'feedback', candidatureId: h.candidature.id, mandatId: h.candidature.mandatId },
        },
      });
    }
    return;
  }

  let en = h.candidateMessage;
  try { [en] = await translateTexts([h.candidateMessage], 'en', changedById); } catch (e) { console.warn('[Espace candidat] traduction impossible', (e as Error).message); }
  await prisma.stageHistory.update({ where: { id: h.id }, data: { candidateMessageEn: en } });

  if (!account.activatedAt) return;
  const c = await prisma.candidat.findUnique({ where: { id: account.candidatId }, select: { prenom: true, nom: true } });
  const presented = PRESENTED_STAGES.includes(h.toStage) || h.toStage === 'REFUSE';
  const company = presented ? h.candidature.mandat.entreprise?.nom : null;
  const role = esc(h.candidature.mandat.titrePoste);
  const team = await teamFor(account.candidatId, account.invitedById);
  const author = team.find((t) => t.id === changedById)?.firstName;
  const quote = `<i>&quot;${esc(en)}&quot;</i>${author ? ` ${esc(author)}` : ''}`;
  const isClosed = h.toStage === 'REFUSE';
  await sendCandidateEmail(changedById, account.email, isClosed ? `Update on the ${h.candidature.mandat.titrePoste} role` : `${company ? company + ': ' : ''}${STEP_LABEL[h.toStage] ?? 'update'}`, {
    paragraphs: isClosed
      ? [
          `Hi ${esc(firstName(c ?? {}))},`,
          `<b>The update:</b> the company decided not to move forward with your profile for the <b>${role}</b> role.`,
          `<b>Their feedback:</b> ${quote}`,
          '<b>What is next:</b> your other processes are not affected, and we keep you in mind for the next roles that fit.',
        ]
      : [
          `Hi ${esc(firstName(c ?? {}))},`,
          `News on the <b>${role}</b> role${company ? ` at <b>${esc(company)}</b>` : ''}: ${esc(lowerStep(STEP_LABEL[h.toStage] ?? 'new step'))}.`,
          quote,
        ],
    cta: { label: isClosed ? 'Open my space' : 'See the update', href: `${BASE}/espace/process/${h.candidature.id}` },
    signature: signatureOf(team),
  }).catch((e) => console.warn('[Espace candidat] email de mise à jour non envoyé', (e as Error).message));
}

/** Ajoute (après coup) le message au candidat sur la dernière étape d'une candidature. */
export async function addMessage(candidatureId: string, userId: string, message: string) {
  const text = message.trim();
  if (!text) throw new ValidationError('Le message est vide.');
  const h = await prisma.stageHistory.findFirst({ where: { candidatureId }, orderBy: { changedAt: 'desc' }, select: { id: true } });
  if (!h) throw new NotFoundError('Changement d\'étape', candidatureId);
  await prisma.stageHistory.update({ where: { id: h.id }, data: { candidateMessage: text.slice(0, 2000), candidateMessageEn: null } });
  await prisma.activite.updateMany({
    where: {
      isTache: true, tacheCompleted: false,
      AND: [{ metadata: { path: ['candidateSpace'], equals: 'feedback' } }, { metadata: { path: ['candidatureId'], equals: candidatureId } }],
    } as any,
    data: { tacheCompleted: true },
  }).catch(() => {});
  await onStageChanged(h.id, userId);
  return { ok: true };
}
