import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  mandat: { findUnique: vi.fn() },
  entreprise: { findUnique: vi.fn() },
  client: { findFirst: vi.fn() },
  contractApproval: { findFirst: vi.fn() },
  activite: { create: vi.fn() },
}));
const upload = vi.hoisted(() => vi.fn());
const render = vi.hoisted(() => vi.fn());

vi.mock('../../lib/db.js', () => ({ default: db }));
vi.mock('../documents/document.service.js', () => ({ upload }));
vi.mock('./contract-pdf.js', () => ({ renderContractPdf: render }));

import { generateContract } from './contract-generate.service.js';

const ENTREPRISE = { id: 'e1', nom: 'Acme Industries SAS', siret: '12345678900012', siren: '123456789', adresseComplete: '12 rue de la Paix, 75002 Paris', localisation: 'Paris' };
const MANDAT = {
  id: 'm1', titrePoste: 'Head of Sales', feePourcentage: '20.00', paymentTerms: '45j_fdm', applicableCountry: 'GB',
  entreprise: ENTREPRISE, client: { nom: 'Martin', prenom: 'Claire', email: 'claire@acme.fr' },
};

beforeEach(() => {
  vi.clearAllMocks();
  render.mockResolvedValue(Buffer.from('%PDF-fake'));
  upload.mockImplementation(async (type: string, id: string, _b: Buffer, name: string) => ({ url: `/uploads/documents/${type}/${id}/abcd1234_${name}` }));
  db.activite.create.mockResolvedValue({});
  db.contractApproval.findFirst.mockResolvedValue(null);
  db.client.findFirst.mockResolvedValue(null);
});

describe('generateContract depuis un mandat', () => {
  it('préremplit tout depuis le mandat et renvoie le lien du PDF', async () => {
    db.mandat.findUnique.mockResolvedValue(MANDAT);
    const r = await generateContract({ mandatId: 'm1' }, 'u1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.terms).toEqual({
      client: 'Acme Industries SAS', siret: '12345678900012', adresse: '12 rue de la Paix, 75002 Paris',
      rep: 'Claire Martin', email: 'claire@acme.fr', pays: 'l’Angleterre et du Pays de Galles',
      feePct: '20', garantieMois: '3', proprieteMois: '12', paiement: '45 jours fin de mois', poste: 'Head of Sales',
    });
    expect(r.missing).toEqual([]);
    expect(r.url).toBe('https://ats.propium.co/uploads/documents/mandat/m1/abcd1234_Contrat_HumanUp_Acme_Industries_SAS.pdf');
    expect(render).toHaveBeenCalledWith(r.terms, 'fr');
    expect(upload).toHaveBeenCalledWith('mandat', 'm1', expect.any(Buffer), 'Contrat_HumanUp_Acme_Industries_SAS.pdf', 'application/pdf');
  });

  it('trace une activité « Contrat généré » avec le PDF en pièce jointe, sans toucher au statut du contrat', async () => {
    db.mandat.findUnique.mockResolvedValue(MANDAT);
    await generateContract({ mandatId: 'm1' }, 'u1');
    const data = db.activite.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ titre: 'Contrat généré', entiteType: 'MANDAT', entiteId: 'm1', userId: 'u1', source: 'AGENT_IA' });
    expect(data.fichiers.create[0]).toMatchObject({ mimeType: 'application/pdf', nom: 'Contrat_HumanUp_Acme_Industries_SAS.pdf' });
    expect((db.mandat as Record<string, unknown>).update).toBeUndefined();
  });

  it('applique les valeurs passées en paramètre en priorité', async () => {
    db.mandat.findUnique.mockResolvedValue(MANDAT);
    const r = await generateContract({
      mandatId: 'm1', lang: 'en', feePct: 25, paymentTerms: '60j', country: 'HK', guaranteeMonths: 6, ownershipMonths: 24,
      signatoryName: 'John Doe', signatoryEmail: 'john@acme.com', address: '1 Queen St', registration: 'HK-999', jobTitle: 'CRO',
    }, 'u1');
    expect(r.ok && r.terms).toEqual({
      client: 'Acme Industries SAS', siret: 'HK-999', adresse: '1 Queen St', rep: 'John Doe', email: 'john@acme.com',
      pays: 'Hong Kong', feePct: '25', garantieMois: '6', proprieteMois: '24', paiement: '60 days from invoice date', poste: 'CRO',
    });
    expect(r.ok && r.filename).toBe('Agreement_HumanUp_Acme_Industries_SAS.pdf');
  });

  it('garde un texte libre pour le paiement et le pays', async () => {
    db.mandat.findUnique.mockResolvedValue(MANDAT);
    const r = await generateContract({ mandatId: 'm1', paymentTerms: '50 % à la signature, 50 % à l’arrivée', country: 'Maroc' }, 'u1');
    expect(r.ok && r.terms.paiement).toBe('50 % à la signature, 50 % à l’arrivée');
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
    expect(r.ok).toBe(true);
    expect(r.ok && r.missing).toEqual(['address', 'registration', 'signatory_name', 'signatory_email']);
  });

  it('prend un contact de la société quand le mandat n’a pas de client', async () => {
    db.mandat.findUnique.mockResolvedValue({ ...MANDAT, client: null });
    db.client.findFirst.mockResolvedValue({ nom: 'Durand', prenom: 'Paul', email: 'paul@acme.fr' });
    const r = await generateContract({ mandatId: 'm1' }, 'u1');
    expect(r.ok && r.terms.rep).toBe('Paul Durand');
    expect(r.ok && r.terms.email).toBe('paul@acme.fr');
    expect(db.client.findFirst.mock.calls[0][0].where).toMatchObject({ entrepriseId: 'e1' });
  });

  it('renvoie not_found pour un mandat inconnu', async () => {
    db.mandat.findUnique.mockResolvedValue(null);
    const r = await generateContract({ mandatId: 'nope' }, 'u1');
    expect(r).toMatchObject({ ok: false, error: 'not_found' });
    expect(render).not.toHaveBeenCalled();
  });

  it('refuse un fee invalide', async () => {
    db.mandat.findUnique.mockResolvedValue(MANDAT);
    expect(await generateContract({ mandatId: 'm1', feePct: 0 }, 'u1')).toMatchObject({ ok: false, error: 'invalid' });
    expect(await generateContract({ mandatId: 'm1', feePct: 150 }, 'u1')).toMatchObject({ ok: false, error: 'invalid' });
  });
});

describe('règle des 18 %', () => {
  beforeEach(() => db.mandat.findUnique.mockResolvedValue(MANDAT));

  it('accepte 18 % pile sans validation', async () => {
    const r = await generateContract({ mandatId: 'm1', feePct: 18 }, 'u1');
    expect(r.ok).toBe(true);
    expect(db.contractApproval.findFirst).not.toHaveBeenCalled();
  });

  it('refuse sous 18 % sans validation, en indiquant qu’aucune demande n’existe', async () => {
    const r = await generateContract({ mandatId: 'm1', feePct: 15 }, 'u1');
    expect(r).toMatchObject({ ok: false, error: 'needs_admin_approval', approvalStatus: 'NONE' });
    expect(render).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('signale une demande déjà en attente', async () => {
    db.contractApproval.findFirst.mockImplementation(async ({ where }: { where: { status: string } }) =>
      where.status === 'PENDING' ? { feeRequested: '15.00' } : null);
    const r = await generateContract({ mandatId: 'm1', feePct: 15 }, 'u1');
    expect(r).toMatchObject({ ok: false, error: 'needs_admin_approval', approvalStatus: 'PENDING' });
  });

  it('génère quand une validation APPROVED existe au même taux', async () => {
    db.contractApproval.findFirst.mockImplementation(async ({ where }: { where: { status: string } }) =>
      where.status === 'APPROVED' ? { feeRequested: '15.00' } : null);
    const r = await generateContract({ mandatId: 'm1', feePct: 15 }, 'u1');
    expect(r.ok && r.terms.feePct).toBe('15');
  });

  it('refuse quand la validation porte sur un autre taux', async () => {
    db.contractApproval.findFirst.mockImplementation(async ({ where }: { where: { status: string } }) =>
      where.status === 'APPROVED' ? { feeRequested: '16.00' } : null);
    expect(await generateContract({ mandatId: 'm1', feePct: 15 }, 'u1')).toMatchObject({ ok: false, error: 'needs_admin_approval' });
  });

  it('applique aussi la règle au fee stocké sur le mandat', async () => {
    db.mandat.findUnique.mockResolvedValue({ ...MANDAT, feePourcentage: '12.00' });
    expect(await generateContract({ mandatId: 'm1' }, 'u1')).toMatchObject({ ok: false, error: 'needs_admin_approval' });
  });

  it('refuse sous 18 % sans mandat (la validation est liée au mandat)', async () => {
    db.entreprise.findUnique.mockResolvedValue(ENTREPRISE);
    const r = await generateContract({ entrepriseId: 'e1', feePct: 15 }, 'u1');
    expect(r).toMatchObject({ ok: false, error: 'needs_admin_approval' });
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
