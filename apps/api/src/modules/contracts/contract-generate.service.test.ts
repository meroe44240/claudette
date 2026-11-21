import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  mandat: { findUnique: vi.fn() },
  entreprise: { findUnique: vi.fn() },
  client: { findFirst: vi.fn() },
  contractApproval: { findMany: vi.fn() },
  activite: { create: vi.fn() },
}));
const upload = vi.hoisted(() => vi.fn());
const render = vi.hoisted(() => vi.fn());

vi.mock('../../lib/db.js', () => ({ default: db }));
vi.mock('../documents/document.service.js', () => ({ upload }));
vi.mock('./contract-pdf.js', () => ({
  renderContractPdf: render,
  customClauseHeading: (l: string) => (l === 'fr' ? 'Article 19 - Conditions particulières' : 'Article 19 - Special conditions'),
}));

import { generateContract, computeExceptions, canonicalExceptions, paymentDays, approvalExceptions } from './contract-generate.service.js';

const ENTREPRISE = { id: 'e1', nom: 'Acme Industries SAS', siret: '12345678900012', siren: '123456789', adresseComplete: '12 rue de la Paix, 75002 Paris', localisation: 'Paris' };
const MANDAT = {
  id: 'm1', titrePoste: 'Head of Sales', feePourcentage: '20.00', paymentTerms: '45j_fdm', applicableCountry: 'GB',
  entreprise: ENTREPRISE, client: { nom: 'Martin', prenom: 'Claire', email: 'claire@acme.fr' },
};
const approval = (status: string, exceptions: object | null, feeRequested = '20.00') => ({ id: `ap-${status}`, status, exceptions, feeRequested });

beforeEach(() => {
  vi.clearAllMocks();
  render.mockResolvedValue(Buffer.from('%PDF-fake'));
  upload.mockImplementation(async (type: string, id: string, _b: Buffer, name: string) => ({ url: `/uploads/documents/${type}/${id}/abcd1234_${name}` }));
  db.activite.create.mockResolvedValue({});
  db.contractApproval.findMany.mockResolvedValue([]);
  db.client.findFirst.mockResolvedValue(null);
  db.mandat.findUnique.mockResolvedValue(MANDAT);
});

describe('helpers', () => {
  it('lit le délai de paiement dans un texte libre', () => {
    expect(paymentDays('45 jours fin de mois')).toBe(45);
    expect(paymentDays('90 days net')).toBe(90);
    expect(paymentDays('30j puis 90j')).toBe(90);
    expect(paymentDays('à réception')).toBeNull();
    expect(paymentDays('jeudi')).toBeNull();
  });

  it('compare les exceptions sans dépendre de l’ordre des clés ni des espaces', () => {
    expect(canonicalExceptions({ guarantee_months: 9, fee_percent: 15 })).toBe(canonicalExceptions({ fee_percent: 15, guarantee_months: 9 }));
    expect(canonicalExceptions({ custom_clause: ' Exclusivité 3 mois ' })).toBe(canonicalExceptions({ custom_clause: 'Exclusivité 3 mois' }));
    expect(canonicalExceptions({ fee_percent: 15 })).not.toBe(canonicalExceptions({ fee_percent: 16 }));
  });

  it('lit les anciennes validations (fee seul) comme une exception de fee', () => {
    expect(approvalExceptions({ exceptions: null, feeRequested: '15.00' })).toEqual({ fee_percent: 15 });
    expect(approvalExceptions({ exceptions: { guarantee_months: 9 }, feeRequested: '20.00' })).toEqual({ guarantee_months: 9 });
  });
});

describe('computeExceptions (bornes)', () => {
  const base = { fee: 20, guarantee: 3, ownership: 12, paymentRaw: '30j', customClause: null };

  it('aucune exception dans les conditions standard, bornes incluses', () => {
    for (const v of [base, { ...base, fee: 18, guarantee: 0, ownership: 6, paymentRaw: '60j' }, { ...base, guarantee: 6, ownership: 24, paymentRaw: '60 jours date de facture' }]) {
      const r = computeExceptions(v);
      expect('exceptions' in r && r.exceptions).toEqual({});
    }
  });

  it('signale chaque valeur hors bornes', () => {
    const r = computeExceptions({ fee: 15, guarantee: 9, ownership: 30, paymentRaw: '90 jours', customClause: 'Exclusivité 3 mois' });
    expect('exceptions' in r && r.exceptions).toEqual({
      fee_percent: 15, guarantee_months: 9, ownership_months: 30, payment_terms: '90 jours', custom_clause: 'Exclusivité 3 mois',
    });
    expect('labels' in r && r.labels).toHaveLength(5);
  });

  it('propriété trop courte = exception', () => {
    const r = computeExceptions({ ...base, ownership: 3 });
    expect('exceptions' in r && r.exceptions).toEqual({ ownership_months: 3 });
  });

  it('paiement sans délai lisible = exception', () => {
    const r = computeExceptions({ ...base, paymentRaw: 'à la convenance du client' });
    expect('exceptions' in r && r.exceptions).toEqual({ payment_terms: 'à la convenance du client' });
  });

  it('les codes de paiement connus passent tous', () => {
    for (const c of ['reception', 'signature', '30j', '45j_fdm', '60j']) {
      const r = computeExceptions({ ...base, paymentRaw: c });
      expect('exceptions' in r && r.exceptions).toEqual({});
    }
  });

  it('refuse net ce qui dépasse les bornes dures', () => {
    expect(computeExceptions({ ...base, fee: 0 })).toHaveProperty('error');
    expect(computeExceptions({ ...base, fee: 101 })).toHaveProperty('error');
    expect(computeExceptions({ ...base, guarantee: 13 })).toHaveProperty('error');
    expect(computeExceptions({ ...base, guarantee: -1 })).toHaveProperty('error');
    expect(computeExceptions({ ...base, guarantee: 2.5 })).toHaveProperty('error');
    expect(computeExceptions({ ...base, ownership: 0 })).toHaveProperty('error');
    expect(computeExceptions({ ...base, ownership: 61 })).toHaveProperty('error');
    expect(computeExceptions({ ...base, customClause: 'x'.repeat(2001) })).toHaveProperty('error');
  });
});

describe('generateContract depuis un mandat (conditions standard)', () => {
  it('préremplit tout depuis le mandat et renvoie le lien du PDF', async () => {
    const r = await generateContract({ mandatId: 'm1' }, 'u1');
    expect(r.ok).toBe(true);
    if (!r.ok || r.preview) return;
    expect(r.terms).toEqual({
      client: 'Acme Industries SAS', siret: '12345678900012', adresse: '12 rue de la Paix, 75002 Paris',
      rep: 'Claire Martin', email: 'claire@acme.fr', pays: 'l’Angleterre et du Pays de Galles',
      feePct: '20', garantieMois: '3', proprieteMois: '12', paiement: '45 jours fin de mois', poste: 'Head of Sales',
    });
    expect(r.approval).toBe('not_needed');
    expect(r.missing).toEqual([]);
    expect(r.url).toBe('https://ats.propium.co/uploads/documents/mandat/m1/abcd1234_Contrat_HumanUp_Acme_Industries_SAS.pdf');
    expect(render).toHaveBeenCalledWith(r.terms, 'fr', { customClause: null });
    expect(db.contractApproval.findMany).not.toHaveBeenCalled();
  });

  it('trace une activité « Contrat généré » avec le PDF en pièce jointe, sans toucher au statut du contrat', async () => {
    await generateContract({ mandatId: 'm1' }, 'u1');
    const data = db.activite.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ titre: 'Contrat généré', entiteType: 'MANDAT', entiteId: 'm1', userId: 'u1', source: 'AGENT_IA' });
    expect(data.fichiers.create[0]).toMatchObject({ mimeType: 'application/pdf', nom: 'Contrat_HumanUp_Acme_Industries_SAS.pdf' });
    expect(data.metadata.exceptions).toBeUndefined();
    expect((db.mandat as Record<string, unknown>).update).toBeUndefined();
  });

  it('applique les valeurs passées en paramètre en priorité', async () => {
    const r = await generateContract({
      mandatId: 'm1', lang: 'en', feePct: 25, paymentTerms: '60j', country: 'HK', guaranteeMonths: 6, ownershipMonths: 24,
      signatoryName: 'John Doe', signatoryEmail: 'john@acme.com', address: '1 Queen St', registration: 'HK-999', jobTitle: 'CRO',
    }, 'u1');
    expect(r.ok && r.terms).toEqual({
      client: 'Acme Industries SAS', siret: 'HK-999', adresse: '1 Queen St', rep: 'John Doe', email: 'john@acme.com',
      pays: 'Hong Kong', feePct: '25', garantieMois: '6', proprieteMois: '24', paiement: '60 days from invoice date', poste: 'CRO',
    });
    expect(r.ok && !r.preview && r.filename).toBe('Agreement_HumanUp_Acme_Industries_SAS.pdf');
  });

  it('accepte un paiement en texte libre sous 60 jours et un pays libre', async () => {
    const r = await generateContract({ mandatId: 'm1', paymentTerms: '50 % à 30 jours, solde à 45 jours', country: 'Maroc' }, 'u1');
    expect(r.ok && r.terms.paiement).toBe('50 % à 30 jours, solde à 45 jours');
    expect(r.ok && r.terms.pays).toBe('Maroc');
  });

  it('prend les valeurs par défaut quand le mandat n’a ni paiement ni pays', async () => {
    db.mandat.findUnique.mockResolvedValue({ ...MANDAT, paymentTerms: null, applicableCountry: null });
    const r = await generateContract({ mandatId: 'm1' }, 'u1');
    expect(r.ok && r.terms.paiement).toBe('30 jours date de facture');
    expect(r.ok && r.terms.pays).toBe('France');
  });

  it('liste les champs manquants sans bloquer la génération', async () => {
    db.mandat.findUnique.mockResolvedValue({
      ...MANDAT, client: null,
      entreprise: { ...ENTREPRISE, siret: null, siren: null, adresseComplete: null, localisation: null },
    });
    const r = await generateContract({ mandatId: 'm1' }, 'u1');
    expect(r.ok && r.missing).toEqual(['address', 'registration', 'signatory_name', 'signatory_email']);
  });

  it('prend un contact de la société quand le mandat n’a pas de client', async () => {
    db.mandat.findUnique.mockResolvedValue({ ...MANDAT, client: null });
    db.client.findFirst.mockResolvedValue({ nom: 'Durand', prenom: 'Paul', email: 'paul@acme.fr' });
    const r = await generateContract({ mandatId: 'm1' }, 'u1');
    expect(r.ok && r.terms.rep).toBe('Paul Durand');
    expect(db.client.findFirst.mock.calls[0][0].where).toMatchObject({ entrepriseId: 'e1' });
  });

  it('renvoie not_found pour un mandat inconnu', async () => {
    db.mandat.findUnique.mockResolvedValue(null);
    expect(await generateContract({ mandatId: 'nope' }, 'u1')).toMatchObject({ ok: false, error: 'not_found' });
    expect(render).not.toHaveBeenCalled();
  });

  it('refuse une valeur hors bornes dures sans rien générer', async () => {
    expect(await generateContract({ mandatId: 'm1', feePct: 0 }, 'u1')).toMatchObject({ ok: false, error: 'invalid' });
    expect(await generateContract({ mandatId: 'm1', guaranteeMonths: 24 }, 'u1')).toMatchObject({ ok: false, error: 'invalid' });
    expect(render).not.toHaveBeenCalled();
  });
});

describe('aperçu (preview)', () => {
  it('renvoie le contenu et la liste des articles sans rien générer ni écrire', async () => {
    const r = await generateContract({ mandatId: 'm1', preview: true }, 'u1');
    expect(r).toMatchObject({ ok: true, preview: true, approval: 'not_needed', exceptions: {} });
    if (!r.ok) return;
    expect(r.articles).toHaveLength(19);
    expect(r.articles[0]).toBe('Article 1 - Objet du Contrat');
    expect(r.articles).toContain('Article 8 bis - Référence et communication');
    expect(render).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(db.activite.create).not.toHaveBeenCalled();
  });

  it('annonce la validation nécessaire et l’article 19 quand il y a une clause libre', async () => {
    const r = await generateContract({ mandatId: 'm1', preview: true, customClause: 'Exclusivité de 3 mois.' }, 'u1');
    expect(r).toMatchObject({ ok: true, preview: true, approval: 'required', exceptions: { custom_clause: 'Exclusivité de 3 mois.' } });
    expect(r.ok && r.articles).toHaveLength(20);
    expect(r.ok && r.articles[19]).toBe('Article 19 - Conditions particulières');
  });

  it('signale une demande déjà en attente', async () => {
    db.contractApproval.findMany.mockResolvedValue([approval('PENDING', { guarantee_months: 9 })]);
    const r = await generateContract({ mandatId: 'm1', preview: true, guaranteeMonths: 9 }, 'u1');
    expect(r).toMatchObject({ ok: true, approval: 'pending', approvalId: 'ap-PENDING' });
  });
});

describe('validation admin des conditions hors standard', () => {
  it('refuse sans validation et liste ce qui sort des bornes', async () => {
    const r = await generateContract({ mandatId: 'm1', feePct: 15, guaranteeMonths: 9 }, 'u1');
    expect(r).toMatchObject({ ok: false, error: 'needs_admin_approval', approvalStatus: 'NONE', exceptions: { fee_percent: 15, guarantee_months: 9 } });
    expect(!r.ok && r.exceptionLabels).toHaveLength(2);
    expect(render).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('génère quand une validation porte exactement sur ces valeurs', async () => {
    db.contractApproval.findMany.mockResolvedValue([approval('APPROVED', { guarantee_months: 9, fee_percent: 15 })]);
    const r = await generateContract({ mandatId: 'm1', feePct: 15, guaranteeMonths: 9 }, 'u1');
    expect(r).toMatchObject({ ok: true, preview: false, approval: 'approved', approvalId: 'ap-APPROVED' });
    const data = db.activite.create.mock.calls[0][0].data;
    expect(data.metadata).toMatchObject({ exceptions: { fee_percent: 15, guarantee_months: 9 }, approvalId: 'ap-APPROVED' });
    expect(data.contenu).toContain('validé par un admin');
  });

  it('refuse si la validation porte sur d’autres valeurs', async () => {
    db.contractApproval.findMany.mockResolvedValue([approval('APPROVED', { fee_percent: 15 })]);
    // le fee validé, mais on ajoute une garantie hors bornes non validée
    expect(await generateContract({ mandatId: 'm1', feePct: 15, guaranteeMonths: 9 }, 'u1')).toMatchObject({ ok: false, error: 'needs_admin_approval' });
    // un autre fee
    expect(await generateContract({ mandatId: 'm1', feePct: 14 }, 'u1')).toMatchObject({ ok: false, error: 'needs_admin_approval' });
  });

  it('la clause libre validée doit être mot pour mot la même', async () => {
    db.contractApproval.findMany.mockResolvedValue([approval('APPROVED', { custom_clause: 'Exclusivité de 3 mois.' })]);
    const ok = await generateContract({ mandatId: 'm1', customClause: 'Exclusivité de 3 mois.' }, 'u1');
    expect(ok).toMatchObject({ ok: true, preview: false });
    expect(render).toHaveBeenCalledWith(expect.anything(), 'fr', { customClause: 'Exclusivité de 3 mois.' });
    const changed = await generateContract({ mandatId: 'm1', customClause: 'Exclusivité de 6 mois.' }, 'u1');
    expect(changed).toMatchObject({ ok: false, error: 'needs_admin_approval' });
  });

  it('une validation rejetée ou en attente ne suffit pas', async () => {
    db.contractApproval.findMany.mockResolvedValue([approval('PENDING', { fee_percent: 15 })]);
    expect(await generateContract({ mandatId: 'm1', feePct: 15 }, 'u1')).toMatchObject({ ok: false, error: 'needs_admin_approval', approvalStatus: 'PENDING' });
    expect(db.contractApproval.findMany.mock.calls[0][0].where.status).toEqual({ in: ['APPROVED', 'PENDING'] });
  });

  it('accepte une ancienne validation de fee (sans exceptions stockées)', async () => {
    db.contractApproval.findMany.mockResolvedValue([approval('APPROVED', null, '15.00')]);
    expect(await generateContract({ mandatId: 'm1', feePct: 15 }, 'u1')).toMatchObject({ ok: true });
  });

  it('applique la règle au fee stocké sur le mandat', async () => {
    db.mandat.findUnique.mockResolvedValue({ ...MANDAT, feePourcentage: '12.00' });
    expect(await generateContract({ mandatId: 'm1' }, 'u1')).toMatchObject({ ok: false, error: 'needs_admin_approval' });
  });

  it('18 % pile, garantie 6 mois, propriété 6 et 24 mois, 60 jours : pas de validation', async () => {
    expect(await generateContract({ mandatId: 'm1', feePct: 18, guaranteeMonths: 6, ownershipMonths: 6, paymentTerms: '60j' }, 'u1')).toMatchObject({ ok: true });
    expect(await generateContract({ mandatId: 'm1', ownershipMonths: 24 }, 'u1')).toMatchObject({ ok: true });
  });

  it('sans mandat, les conditions hors standard sont refusées (la validation est liée au mandat)', async () => {
    db.entreprise.findUnique.mockResolvedValue(ENTREPRISE);
    const r = await generateContract({ entrepriseId: 'e1', customClause: 'x' }, 'u1');
    expect(r).toMatchObject({ ok: false, error: 'needs_admin_approval' });
    expect(!r.ok && r.message).toContain('create the mandate first');
  });
});

describe('generateContract depuis une société', () => {
  it('génère avec les défauts et range le PDF sur la société', async () => {
    db.entreprise.findUnique.mockResolvedValue(ENTREPRISE);
    db.client.findFirst.mockResolvedValue({ nom: 'Martin', prenom: 'Claire', email: 'claire@acme.fr' });
    const r = await generateContract({ entrepriseId: 'e1' }, 'u1');
    expect(r.ok && r.terms).toMatchObject({ feePct: '20', pays: 'France', paiement: '30 jours date de facture', poste: '', rep: 'Claire Martin' });
    expect(r.ok && r.mandatId).toBeNull();
    expect(upload.mock.calls[0][0]).toBe('entreprise');
    expect(db.activite.create.mock.calls[0][0].data).toMatchObject({ entiteType: 'ENTREPRISE', entiteId: 'e1' });
  });

  it('renvoie not_found pour une société inconnue', async () => {
    db.entreprise.findUnique.mockResolvedValue(null);
    expect(await generateContract({ entrepriseId: 'x' }, 'u1')).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('exige un mandat ou une société', async () => {
    expect(await generateContract({}, 'u1')).toMatchObject({ ok: false, error: 'invalid' });
  });
});
