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
import { renderContractPdf, customClauseHeading } from './contract-pdf.js';
import { contractArticles, artHead, type ContractForm, type ContractLang } from './contract-text.js';

export const FEE_FLOOR = 18;

/**
 * Garde-fous du contrat généré par le MCP. Les 19 articles sont tous
 * verrouillés : on ne peut jouer que sur les valeurs ci-dessous, plus une
 * clause « Conditions particulières ».
 * - SOFT : hors de ces bornes, il faut une validation admin (ContractApproval).
 * - HARD : hors de ces bornes, refus net (même un admin ne peut pas valider).
 */
export const BOUNDS = {
  feeMin: FEE_FLOOR,
  guaranteeMin: 0, guaranteeMax: 6,
  ownershipMin: 6, ownershipMax: 24,
  paymentMaxDays: 60,
} as const;
const HARD = { guaranteeMax: 12, ownershipMin: 1, ownershipMax: 60, customClauseMaxLen: 2000 } as const;

/** Valeurs hors bornes demandées (seulement celles-là), telles que validées par un admin. */
export interface ContractExceptions {
  fee_percent?: number;
  guarantee_months?: number;
  ownership_months?: number;
  payment_terms?: string;
  custom_clause?: string;
}

/** Forme canonique (clés triées) pour comparer une demande à une validation. */
export function canonicalExceptions(e: ContractExceptions): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(e).sort()) {
    const v = (e as Record<string, unknown>)[k];
    if (v !== undefined) sorted[k] = typeof v === 'string' ? v.trim() : v;
  }
  return JSON.stringify(sorted);
}

/** Délai de paiement en jours lu dans un texte libre (« 45 jours fin de mois » → 45). null si illisible. */
export function paymentDays(text: string): number | null {
  const nums = [...text.matchAll(/(\d{1,3})\s*(?:jours?|days?|j\b)/gi)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : null;
}

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
  customClause?: string;   // « Conditions particulières » (validation admin obligatoire)
  preview?: boolean;       // ne génère rien : renvoie ce qui irait dans le contrat
}

export type ApprovalState = 'not_needed' | 'approved' | 'pending' | 'required';

interface ContractSummary {
  lang: ContractLang;
  mandatId: string | null;
  entrepriseId: string;
  terms: ContractForm;
  customClause: string | null;
  articles: string[];
  exceptions: ContractExceptions;
  exceptionLabels: string[];
  approval: ApprovalState;
  approvalId: string | null;
  missing: string[];
}

export type GenerateContractResult =
  | ({ ok: true; preview: true } & ContractSummary)
  | ({ ok: true; preview: false; url: string; filename: string; sizeBytes: number } & ContractSummary)
  | {
      ok: false;
      error: 'needs_admin_approval' | 'not_found' | 'invalid';
      message: string;
      approvalStatus?: 'NONE' | 'PENDING';
      exceptions?: ContractExceptions;
      exceptionLabels?: string[];
    };

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

/**
 * Valeurs hors bornes « souples » (à faire valider par un admin), ou erreur si
 * une valeur sort des bornes « dures ».
 */
export function computeExceptions(v: {
  fee: number; guarantee: number; ownership: number; paymentRaw: string; customClause: string | null;
}): { exceptions: ContractExceptions; labels: string[] } | { error: string } {
  if (!Number.isFinite(v.fee) || v.fee <= 0 || v.fee > 100) return { error: `Invalid fee: ${v.fee}.` };
  if (!Number.isInteger(v.guarantee) || v.guarantee < 0 || v.guarantee > HARD.guaranteeMax) {
    return { error: `The replacement guarantee must be a whole number of months between 0 and ${HARD.guaranteeMax}.` };
  }
  if (!Number.isInteger(v.ownership) || v.ownership < HARD.ownershipMin || v.ownership > HARD.ownershipMax) {
    return { error: `Candidate ownership must be a whole number of months between ${HARD.ownershipMin} and ${HARD.ownershipMax}.` };
  }
  if (v.customClause && v.customClause.length > HARD.customClauseMaxLen) {
    return { error: `The special conditions clause is limited to ${HARD.customClauseMaxLen} characters.` };
  }

  const exceptions: ContractExceptions = {};
  const labels: string[] = [];
  if (v.fee < BOUNDS.feeMin) {
    exceptions.fee_percent = Number(v.fee.toFixed(2));
    labels.push(`fee ${exceptions.fee_percent}% (floor ${BOUNDS.feeMin}%)`);
  }
  if (v.guarantee < BOUNDS.guaranteeMin || v.guarantee > BOUNDS.guaranteeMax) {
    exceptions.guarantee_months = v.guarantee;
    labels.push(`replacement guarantee ${v.guarantee} months (allowed ${BOUNDS.guaranteeMin} to ${BOUNDS.guaranteeMax})`);
  }
  if (v.ownership < BOUNDS.ownershipMin || v.ownership > BOUNDS.ownershipMax) {
    exceptions.ownership_months = v.ownership;
    labels.push(`candidate ownership ${v.ownership} months (allowed ${BOUNDS.ownershipMin} to ${BOUNDS.ownershipMax})`);
  }
  const pay = v.paymentRaw.trim();
  if (!PAYMENT_TERMS[pay]) {
    const days = paymentDays(pay);
    if (days === null || days > BOUNDS.paymentMaxDays) {
      exceptions.payment_terms = pay;
      labels.push(days === null
        ? `payment terms "${pay}" (no standard delay found, max ${BOUNDS.paymentMaxDays} days)`
        : `payment terms "${pay}" (${days} days, max ${BOUNDS.paymentMaxDays})`);
    }
  }
  if (v.customClause) {
    exceptions.custom_clause = v.customClause;
    labels.push('special conditions clause (free text)');
  }
  return { exceptions, labels };
}

/** Exceptions validées par une approbation (les anciennes demandes ne portaient que sur le fee). */
export function approvalExceptions(a: { exceptions?: unknown; feeRequested: unknown }): ContractExceptions {
  if (a.exceptions && typeof a.exceptions === 'object') return a.exceptions as ContractExceptions;
  return { fee_percent: Number(a.feeRequested) };
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
  const guarantee = input.guaranteeMonths ?? 3;
  const ownership = input.ownershipMonths ?? 12;
  const paymentRaw = (input.paymentTerms ?? mandat?.paymentTerms ?? '30j').trim() || '30j';
  const customClause = input.customClause?.trim() || null;

  const check = computeExceptions({ fee, guarantee, ownership, paymentRaw, customClause });
  if ('error' in check) return { ok: false, error: 'invalid', message: check.error };
  const { exceptions, labels } = check;
  const hasExceptions = Object.keys(exceptions).length > 0;

  // Validation admin : une approbation APPROVED portant exactement sur ces valeurs
  let approval: ApprovalState = 'not_needed';
  let approvalId: string | null = null;
  if (hasExceptions && mandat) {
    const wanted = canonicalExceptions(exceptions);
    const rows = await prisma.contractApproval.findMany({
      where: { mandatId: mandat.id, status: { in: ['APPROVED', 'PENDING'] } },
      orderBy: { createdAt: 'desc' },
    });
    const match = (s: string) => rows.find((r) => r.status === s && canonicalExceptions(approvalExceptions(r)) === wanted);
    const approved = match('APPROVED');
    const pending = match('PENDING');
    if (approved) { approval = 'approved'; approvalId = approved.id; }
    else if (pending) { approval = 'pending'; approvalId = pending.id; }
    else approval = 'required';
  } else if (hasExceptions) {
    approval = 'required';
  }

  const terms: ContractForm = {
    client: entreprise.nom,
    siret: (input.registration ?? entreprise.siret ?? entreprise.siren ?? '').trim(),
    adresse: (input.address ?? entreprise.adresseComplete ?? entreprise.localisation ?? '').trim(),
    rep: (input.signatoryName ?? fullName(contact)).trim(),
    email: (input.signatoryEmail ?? contact?.email ?? '').trim(),
    pays: resolveCountry(input.country ?? mandat?.applicableCountry, lang),
    feePct: String(Number(fee.toFixed(2))),
    garantieMois: String(guarantee),
    proprieteMois: String(ownership),
    paiement: resolvePayment(paymentRaw, lang),
    poste: (input.jobTitle ?? mandat?.titrePoste ?? '').trim(),
  };

  const missing: string[] = [];
  if (!terms.adresse) missing.push('address');
  if (!terms.siret) missing.push('registration');
  if (!terms.rep) missing.push('signatory_name');
  if (!terms.email) missing.push('signatory_email');

  const articles = contractArticles(lang, terms).map(artHead);
  if (customClause) articles.push(customClauseHeading(lang));

  const summary: ContractSummary = {
    lang, mandatId: mandat?.id ?? null, entrepriseId: entreprise.id, terms, customClause, articles,
    exceptions, exceptionLabels: labels, approval, approvalId, missing,
  };

  if (input.preview) return { ok: true, preview: true, ...summary };

  if (approval === 'required' || approval === 'pending') {
    const list = labels.join('; ');
    let message: string;
    if (!mandat) {
      message = `Outside the standard terms (${list}). Admin approval is tied to a mandate: create the mandate first, or stay within the standard terms.`;
    } else if (approval === 'pending') {
      message = `Outside the standard terms (${list}). An admin approval request for exactly these terms is already pending: an admin must approve it before the contract can be generated.`;
    } else {
      message = `Outside the standard terms (${list}). This needs admin approval first. Call generate_contract again with the same values and exception_reason to send the request to the admins.`;
    }
    return {
      ok: false, error: 'needs_admin_approval', message,
      approvalStatus: approval === 'pending' ? 'PENDING' : 'NONE',
      exceptions, exceptionLabels: labels,
    };
  }

  const pdf = await renderContractPdf(terms, lang, { customClause });
  const filename = `${lang === 'fr' ? 'Contrat' : 'Agreement'}_HumanUp_${fileSafe(entreprise.nom)}.pdf`;
  const doc = await uploadDocument(mandat ? 'mandat' : 'entreprise', mandat?.id ?? entreprise.id, pdf, filename, 'application/pdf');
  const url = `${PORTAL_BASE}${doc.url}`;

  await prisma.activite.create({
    data: {
      type: 'NOTE',
      titre: lang === 'fr' ? 'Contrat généré' : 'Contract generated',
      contenu: `Fee ${terms.feePct}% · ${terms.paiement} · ${lang === 'fr' ? 'droit' : 'law'} : ${terms.pays} · ${lang.toUpperCase()}`
        + (hasExceptions ? ` · ${lang === 'fr' ? 'hors conditions standard, validé par un admin' : 'non-standard terms approved by an admin'}` : ''),
      entiteType: mandat ? 'MANDAT' : 'ENTREPRISE',
      entiteId: mandat?.id ?? entreprise.id,
      userId,
      source: 'AGENT_IA',
      metadata: {
        contractGenerated: true, url, fee: Number(terms.feePct), lang,
        ...(hasExceptions ? { exceptions: exceptions as Record<string, string | number>, approvalId } : {}),
      },
      fichiers: { create: [{ nom: filename, url, mimeType: 'application/pdf', taille: pdf.length }] },
    },
  });

  return { ok: true, preview: false, url, filename, sizeBytes: pdf.length, ...summary };
}
