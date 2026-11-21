/**
 * Génération d'un contrat de prestation de recrutement en PDF, prérempli
 * depuis le mandat (ou la société) : fee, conditions de paiement, droit
 * applicable, raison sociale, SIRET, adresse, signataire.
 *
 * Utilisé par l'outil MCP generate_contract. Le PDF est stocké dans les
 * documents de l'entité et joint à une activité « Contrat généré » sur le
 * mandat. Le statut du contrat (contractStatus) n'est pas modifié : générer
 * n'est pas envoyer.
 *
 * Règle des 18 % : sous le plancher, il faut une validation admin APPROVED
 * au même taux sur le mandat (même règle que l'envoi en signature).
 */

import prisma from '../../lib/db.js';
import { upload as uploadDocument } from '../documents/document.service.js';
import { renderContractPdf } from './contract-pdf.js';
import type { ContractForm, ContractLang } from './contract-text.js';

export const FEE_FLOOR = 18;

const PORTAL_BASE = process.env.PORTAL_BASE_URL || 'https://ats.propium.co';

// Codes de Mandat.paymentTerms → libellé
const PAYMENT_TERMS: Record<string, { fr: string; en: string }> = {
  reception: { fr: 'Paiement à réception de facture', en: 'Payment upon receipt of invoice' },
  signature: { fr: 'Paiement à la signature de l’offre par le candidat', en: 'Payment upon signature of the offer by the candidate' },
  '30j': { fr: '30 jours date de facture', en: '30 days from invoice date' },
  '45j_fdm': { fr: '45 jours fin de mois', en: '45 days end of month' },
  '60j': { fr: '60 jours date de facture', en: '60 days from invoice date' },
};

// Codes ISO (Mandat.applicableCountry) → nom du pays dans la clause de droit applicable
const COUNTRIES: Record<string, { fr: string; en: string }> = {
  FR: { fr: 'France', en: 'France' },
  GB: { fr: 'l’Angleterre et du Pays de Galles', en: 'England and Wales' },
  UK: { fr: 'l’Angleterre et du Pays de Galles', en: 'England and Wales' },
  HK: { fr: 'Hong Kong', en: 'Hong Kong' },
  BE: { fr: 'Belgique', en: 'Belgium' },
  CH: { fr: 'Suisse', en: 'Switzerland' },
  LU: { fr: 'Luxembourg', en: 'Luxembourg' },
  CA: { fr: 'Canada', en: 'Canada' },
  SG: { fr: 'Singapour', en: 'Singapore' },
  US: { fr: 'l’État de New York', en: 'the State of New York' },
};

export interface GenerateContractInput {
  mandatId?: string;
  entrepriseId?: string;
  lang?: ContractLang;
  feePct?: number;
  paymentTerms?: string;   // code (30j…) ou texte libre
  country?: string;        // code ISO ou nom
  guaranteeMonths?: number;
  ownershipMonths?: number;
  signatoryName?: string;
  signatoryEmail?: string;
  address?: string;
  registration?: string;   // SIRET / immatriculation
  jobTitle?: string;
}

export type GenerateContractResult =
  | {
      ok: true;
      url: string;
      filename: string;
      sizeBytes: number;
      lang: ContractLang;
      mandatId: string | null;
      entrepriseId: string;
      terms: ContractForm;
      missing: string[];
    }
  | { ok: false; error: 'needs_admin_approval' | 'not_found' | 'invalid'; message: string; approvalStatus?: string };

const fullName = (c: { nom: string; prenom: string | null } | null | undefined) => (c ? `${c.prenom || ''} ${c.nom}`.trim() : '');

function resolvePayment(value: string | null | undefined, lang: ContractLang): string {
  const v = (value || '').trim();
  if (!v) return PAYMENT_TERMS['30j'][lang];
  return PAYMENT_TERMS[v]?.[lang] ?? v;
}

function resolveCountry(value: string | null | undefined, lang: ContractLang): string {
  const v = (value || '').trim();
  if (!v) return COUNTRIES.FR[lang];
  return COUNTRIES[v.toUpperCase()]?.[lang] ?? v;
}

function fileSafe(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').substring(0, 60) || 'Client';
}

export async function generateContract(input: GenerateContractInput, userId: string): Promise<GenerateContractResult> {
  const lang: ContractLang = input.lang === 'en' ? 'en' : 'fr';

  const entrepriseSelect = { id: true, nom: true, siret: true, siren: true, adresseComplete: true, localisation: true } as const;
  type EntrepriseRow = { id: string; nom: string; siret: string | null; siren: string | null; adresseComplete: string | null; localisation: string | null };
  type MandatRow = {
    id: string; titrePoste: string; feePourcentage: unknown; paymentTerms: string | null; applicableCountry: string | null;
    entreprise: EntrepriseRow;
    client: { nom: string; prenom: string | null; email: string | null } | null;
  };
  let mandat: MandatRow | null = null;
  let entreprise: EntrepriseRow;

  if (input.mandatId) {
    mandat = await prisma.mandat.findUnique({
      where: { id: input.mandatId },
      select: {
        id: true, titrePoste: true, feePourcentage: true, paymentTerms: true, applicableCountry: true,
        entreprise: { select: entrepriseSelect },
        client: { select: { nom: true, prenom: true, email: true } },
      },
    });
    if (!mandat) return { ok: false, error: 'not_found', message: `No mandate with id ${input.mandatId}.` };
    entreprise = mandat.entreprise;
  } else if (input.entrepriseId) {
    const e = await prisma.entreprise.findUnique({ where: { id: input.entrepriseId }, select: entrepriseSelect });
    if (!e) return { ok: false, error: 'not_found', message: `No company with id ${input.entrepriseId}.` };
    entreprise = e;
  } else {
    return { ok: false, error: 'invalid', message: 'A mandate or a company is required.' };
  }

  // Contact signataire : le client du mandat, sinon le premier contact de la société avec un email
  let contact = mandat?.client ?? null;
  if (!contact) {
    contact = await prisma.client.findFirst({
      where: { entrepriseId: entreprise.id, email: { not: null } },
      orderBy: { updatedAt: 'desc' },
      select: { nom: true, prenom: true, email: true },
    });
  }

  const fee = input.feePct ?? (mandat ? Number(mandat.feePourcentage) : 20);
  if (!Number.isFinite(fee) || fee <= 0 || fee > 100) {
    return { ok: false, error: 'invalid', message: `Invalid fee: ${input.feePct}.` };
  }

  if (fee < FEE_FLOOR) {
    if (!mandat) {
      return {
        ok: false, error: 'needs_admin_approval',
        message: `A ${fee}% fee is below the ${FEE_FLOOR}% floor and needs admin approval, which is tied to a mandate. Create the mandate first, or use a fee of ${FEE_FLOOR}% or more.`,
      };
    }
    const approval = await prisma.contractApproval.findFirst({
      where: { mandatId: mandat.id, status: 'APPROVED' },
      orderBy: { approvedAt: 'desc' },
    });
    if (!approval || Number(approval.feeRequested) !== fee) {
      const pending = await prisma.contractApproval.findFirst({ where: { mandatId: mandat.id, status: 'PENDING' } });
      return {
        ok: false, error: 'needs_admin_approval',
        approvalStatus: pending ? 'PENDING' : 'NONE',
        message: pending
          ? `A ${fee}% fee is below the ${FEE_FLOOR}% floor. An admin approval request (${Number(pending.feeRequested)}%) is already pending for this mandate: an admin must approve it before the contract can be generated.`
          : `A ${fee}% fee is below the ${FEE_FLOOR}% floor and needs admin approval first. Call generate_contract again with discount_reason to send the approval request to the admins.`,
      };
    }
  }

  const terms: ContractForm = {
    client: entreprise.nom,
    siret: (input.registration ?? entreprise.siret ?? entreprise.siren ?? '').trim(),
    adresse: (input.address ?? entreprise.adresseComplete ?? entreprise.localisation ?? '').trim(),
    rep: (input.signatoryName ?? fullName(contact)).trim(),
    email: (input.signatoryEmail ?? contact?.email ?? '').trim(),
    pays: resolveCountry(input.country ?? mandat?.applicableCountry, lang),
    feePct: String(Number(fee.toFixed(2))),
    garantieMois: String(input.guaranteeMonths ?? 3),
    proprieteMois: String(input.ownershipMonths ?? 12),
    paiement: resolvePayment(input.paymentTerms ?? mandat?.paymentTerms, lang),
    poste: (input.jobTitle ?? mandat?.titrePoste ?? '').trim(),
  };

  const missing: string[] = [];
  if (!terms.adresse) missing.push('address');
  if (!terms.siret) missing.push('registration');
  if (!terms.rep) missing.push('signatory_name');
  if (!terms.email) missing.push('signatory_email');

  const pdf = await renderContractPdf(terms, lang);
  const filename = `${lang === 'fr' ? 'Contrat' : 'Agreement'}_HumanUp_${fileSafe(entreprise.nom)}.pdf`;
  const doc = await uploadDocument(mandat ? 'mandat' : 'entreprise', mandat?.id ?? entreprise.id, pdf, filename, 'application/pdf');
  const url = `${PORTAL_BASE}${doc.url}`;

  await prisma.activite.create({
    data: {
      type: 'NOTE',
      titre: lang === 'fr' ? 'Contrat généré' : 'Contract generated',
      contenu: `Fee ${terms.feePct}% · ${terms.paiement} · ${lang === 'fr' ? 'droit' : 'law'} : ${terms.pays} · ${lang.toUpperCase()}`,
      entiteType: mandat ? 'MANDAT' : 'ENTREPRISE',
      entiteId: mandat?.id ?? entreprise.id,
      userId,
      source: 'AGENT_IA',
      metadata: { contractGenerated: true, url, fee: Number(terms.feePct), lang },
      fichiers: { create: [{ nom: filename, url, mimeType: 'application/pdf', taille: pdf.length }] },
    },
  });

  return {
    ok: true, url, filename, sizeBytes: pdf.length, lang,
    mandatId: mandat?.id ?? null, entrepriseId: entreprise.id, terms, missing,
  };
}
