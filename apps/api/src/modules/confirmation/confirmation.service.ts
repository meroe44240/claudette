/**
 * Confirmation candidat : le recruteur déclenche un email ; le candidat
 * confirme (1) son intérêt pour le poste et (2) l'autorisation de transférer
 * son CV aux clients (consentement général). Tracé sur Candidat + Candidature.
 */
import prisma from '../../lib/db.js';
import { SignJWT, jwtVerify } from 'jose';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { sendEmail, renderBrandedEmail } from '../../lib/mailer.js';

const BASE = process.env.PORTAL_BASE_URL || 'https://ats.propium.co';
const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET || 'dev-access-secret');

interface ConfirmPayload {
  sub: string;   // candidatId
  cid?: string;  // candidatureId (pour tracer l'intérêt sur le bon poste)
  type: 'confirm';
}

async function signToken(candidatId: string, candidatureId?: string): Promise<string> {
  return new SignJWT({ sub: candidatId, cid: candidatureId, type: 'confirm' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
}

async function verifyToken(token: string): Promise<ConfirmPayload> {
  const { payload } = await jwtVerify(token, secret);
  const p = payload as unknown as ConfirmPayload;
  if (p.type !== 'confirm') throw new ValidationError('Lien de confirmation invalide.');
  return p;
}

/** Recruteur : envoie l'email de confirmation au candidat. */
export async function requestConfirmation(candidatId: string) {
  const candidat = await prisma.candidat.findUnique({
    where: { id: candidatId },
    include: {
      candidatures: {
        orderBy: { createdAt: 'desc' },
        include: { mandat: { select: { titrePoste: true } } },
      },
    },
  });
  if (!candidat) throw new NotFoundError('Candidat', candidatId);
  if (!candidat.email) throw new ValidationError("Ce candidat n'a pas d'adresse email.");

  // Poste = candidature active la plus récente (sinon la plus récente tout court)
  const cand = candidat.candidatures.find((c) => c.stage !== 'REFUSE') ?? candidat.candidatures[0] ?? null;
  const poste = cand?.mandat?.titrePoste ?? null;

  const token = await signToken(candidatId, cand?.id);
  const url = `${BASE}/confirmer?token=${encodeURIComponent(token)}`;
  const prenom = candidat.prenom || candidat.nom;
  const posteLine = poste ? `pour le poste de <strong>${poste}</strong> ` : '';

  const html = renderBrandedEmail({
    title: `Bonjour ${prenom},`,
    bodyHtml: `
      <p style="margin:0 0 14px 0;">Nous aimerions présenter votre profil ${posteLine}à notre client.</p>
      <p style="margin:0;">Pour avancer, merci de <strong>confirmer votre intérêt</strong> et de nous <strong>autoriser à transmettre votre CV</strong> à nos clients. Cela prend quelques secondes.</p>
    `,
    cta: { href: url, label: 'Confirmer mon intérêt' },
    signature: "L'équipe HumanUp",
  });

  await sendEmail(candidat.email, `Confirmez votre intérêt${poste ? ` — ${poste}` : ''}`, html);
  return { ok: true, sentTo: candidat.email };
}

/** Public : contexte affiché sur la page de confirmation. */
export async function getContext(token: string) {
  const p = await verifyToken(token);
  const candidat = await prisma.candidat.findUnique({
    where: { id: p.sub },
    select: { prenom: true, nom: true, cvConsent: true },
  });
  if (!candidat) throw new NotFoundError('Candidat', p.sub);

  let poste: string | null = null;
  let interetConfirme = false;
  if (p.cid) {
    const cand = await prisma.candidature.findUnique({
      where: { id: p.cid },
      select: { interetConfirme: true, mandat: { select: { titrePoste: true } } },
    });
    poste = cand?.mandat?.titrePoste ?? null;
    interetConfirme = cand?.interetConfirme ?? false;
  }
  return {
    prenom: candidat.prenom || candidat.nom,
    poste,
    alreadyConfirmed: candidat.cvConsent && (p.cid ? interetConfirme : true),
  };
}

/** Public : le candidat confirme. */
export async function confirm(token: string) {
  const p = await verifyToken(token);
  const now = new Date();
  await prisma.candidat.update({
    where: { id: p.sub },
    data: { cvConsent: true, cvConsentDate: now } as any,
  });
  if (p.cid) {
    await prisma.candidature
      .update({ where: { id: p.cid }, data: { interetConfirme: true, interetConfirmeDate: now } as any })
      .catch(() => null);
  }
  return { ok: true };
}
