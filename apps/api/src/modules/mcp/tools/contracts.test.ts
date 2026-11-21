import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { userId: 'u1', userRole: 'RECRUTEUR' as string },
  resolveMandat: vi.fn(),
  db: {
    entreprise: { findUnique: vi.fn(), findMany: vi.fn() },
    mandat: { findUnique: vi.fn() },
    contractApproval: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
  generateContract: vi.fn(),
  requestContractExceptions: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}));

vi.mock('../mcp.auth.js', () => ({ getMcpUser: () => mocks.user }));
vi.mock('../mcp.logging.js', () => ({ logMcpAction: vi.fn() }));
vi.mock('./portal.js', () => ({ resolveMandat: mocks.resolveMandat }));
vi.mock('../../../lib/db.js', () => ({ default: mocks.db }));
vi.mock('../../contracts/contract-generate.service.js', () => ({
  generateContract: mocks.generateContract,
  approvalExceptions: (a: { exceptions: unknown; feeRequested: unknown }) => a.exceptions ?? { fee_percent: Number(a.feeRequested) },
  BOUNDS: { feeMin: 18, guaranteeMin: 0, guaranteeMax: 6, ownershipMin: 6, ownershipMax: 24, paymentMaxDays: 60 },
}));
vi.mock('../../contracts/contract.service.js', () => ({
  requestContractExceptions: mocks.requestContractExceptions, approve: mocks.approve, reject: mocks.reject,
}));

import { registerContractTools } from './contracts.js';

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
const tools: Record<string, Handler> = {};
const descriptions: Record<string, string> = {};
registerContractTools({ tool: (name: string, d: string, _s: unknown, h: Handler) => { tools[name] = h; descriptions[name] = d; } } as never);

const call = async (tool: string, args: Record<string, unknown>) => JSON.parse((await tools[tool](args)).content[0].text);

const SUMMARY = {
  ok: true, lang: 'fr', mandatId: 'm1', entrepriseId: 'e1', missing: [], customClause: null,
  articles: Array.from({ length: 19 }, (_, i) => `Article ${i + 1}`), exceptions: {}, exceptionLabels: [], approval: 'not_needed', approvalId: null,
  terms: { client: 'Acme', siret: '123', adresse: 'Paris', rep: 'Claire Martin', email: 'c@acme.fr', pays: 'France', feePct: '20', garantieMois: '3', proprieteMois: '12', paiement: '30 jours date de facture', poste: 'Head of Sales' },
};
const OK = { ...SUMMARY, preview: false, url: 'https://ats.propium.co/uploads/documents/mandat/m1/x_Contrat.pdf', filename: 'Contrat.pdf', sizeBytes: 1000 };
const NEEDS = (status: 'NONE' | 'PENDING') => ({
  ok: false, error: 'needs_admin_approval', message: 'Outside the standard terms', approvalStatus: status,
  exceptions: { fee_percent: 15, custom_clause: 'Exclusivité 3 mois' }, exceptionLabels: ['fee 15%', 'special conditions clause (free text)'],
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.userRole = 'RECRUTEUR';
  mocks.resolveMandat.mockResolvedValue({ id: 'm1', titrePoste: 'Head of Sales', entreprise: 'Acme', client: null });
  mocks.generateContract.mockResolvedValue(OK);
  mocks.db.mandat.findUnique.mockResolvedValue({ feePourcentage: '20.00' });
});

describe('generate_contract (MCP)', () => {
  it('décrit les garde-fous et le déroulé aperçu puis génération', () => {
    expect(descriptions.generate_contract).toContain('All 19 articles are locked');
    expect(descriptions.generate_contract).toContain('preview=true');
  });

  it('aperçu : montre le contenu et les articles, ne génère pas de lien', async () => {
    mocks.generateContract.mockResolvedValue({ ...SUMMARY, preview: true });
    const res = await call('generate_contract', { mandate_id: 'm1', preview: true });
    expect(mocks.generateContract).toHaveBeenCalledWith(expect.objectContaining({ preview: true }), 'u1');
    expect(res).toMatchObject({ preview: true, approval: 'not_needed' });
    expect(res.pdf_url).toBeUndefined();
    expect(res.articles).toHaveLength(19);
    expect(res.content).toMatchObject({ client: 'Acme', fee_percent: 20, guarantee_months: 3, ownership_months: 12, governing_law: 'France', special_conditions: null });
    expect(res.message).toContain('confirm before generating');
  });

  it('génère depuis un nom de mandat et renvoie le lien', async () => {
    const res = await call('generate_contract', { mandate_name: 'Head of Sales', fee_percent: 20 });
    expect(mocks.generateContract).toHaveBeenCalledWith(expect.objectContaining({ mandatId: 'm1', feePct: 20, lang: 'fr', preview: false }), 'u1');
    expect(res).toMatchObject({ success: true, pdf_url: OK.url, mandate_id: 'm1' });
    expect(res.message).toContain('Nothing was sent to the client');
  });

  it('transmet la clause libre et les surcharges', async () => {
    await call('generate_contract', { mandate_id: 'm1', language: 'en', country: 'GB', payment_terms: '60j', signatory_name: ' John ', guarantee_months: 6, special_conditions: ' Exclusivity 3 months ' });
    expect(mocks.generateContract).toHaveBeenCalledWith(expect.objectContaining({
      lang: 'en', country: 'GB', paymentTerms: '60j', signatoryName: 'John', guaranteeMonths: 6, customClause: 'Exclusivity 3 months',
    }), 'u1');
  });

  it('hors bornes sans raison : refuse, liste les points, ne crée pas de demande', async () => {
    mocks.generateContract.mockResolvedValue(NEEDS('NONE'));
    const res = await call('generate_contract', { mandate_id: 'm1', fee_percent: 15 });
    expect(res).toMatchObject({ error: 'needs_admin_approval', approval_status: 'NONE' });
    expect(res.non_standard_terms).toHaveLength(2);
    expect(mocks.requestContractExceptions).not.toHaveBeenCalled();
  });

  it('hors bornes avec raison : envoie la demande avec les valeurs exactes', async () => {
    mocks.generateContract.mockResolvedValue(NEEDS('NONE'));
    mocks.requestContractExceptions.mockResolvedValue({ approval: { id: 'ap1' }, created: true });
    const res = await call('generate_contract', { mandate_id: 'm1', fee_percent: 15, special_conditions: 'Exclusivité 3 mois', exception_reason: 'Client stratégique' });
    expect(mocks.requestContractExceptions).toHaveBeenCalledWith({
      mandatId: 'm1', fee: 15, exceptions: { fee_percent: 15, custom_clause: 'Exclusivité 3 mois' },
      exceptionLabels: ['fee 15%', 'special conditions clause (free text)'], reason: 'Client stratégique',
    }, 'u1');
    expect(res).toMatchObject({ error: 'needs_admin_approval', approval_requested: true, approval_id: 'ap1' });
  });

  it('accepte encore discount_reason (ancien nom)', async () => {
    mocks.generateContract.mockResolvedValue(NEEDS('NONE'));
    mocks.requestContractExceptions.mockResolvedValue({ approval: { id: 'ap1' }, created: true });
    await call('generate_contract', { mandate_id: 'm1', fee_percent: 15, discount_reason: 'x' });
    expect(mocks.requestContractExceptions).toHaveBeenCalled();
  });

  it('prend le fee du mandat pour la demande quand il n’est pas précisé', async () => {
    mocks.generateContract.mockResolvedValue(NEEDS('NONE'));
    mocks.db.mandat.findUnique.mockResolvedValue({ feePourcentage: '22.00' });
    mocks.requestContractExceptions.mockResolvedValue({ approval: { id: 'ap1' }, created: true });
    await call('generate_contract', { mandate_id: 'm1', special_conditions: 'x', exception_reason: 'y' });
    expect(mocks.requestContractExceptions.mock.calls[0][0].fee).toBe(22);
  });

  it('ne recrée pas de demande si une est déjà en attente', async () => {
    mocks.generateContract.mockResolvedValue(NEEDS('PENDING'));
    const res = await call('generate_contract', { mandate_id: 'm1', fee_percent: 15, exception_reason: 'x' });
    expect(mocks.requestContractExceptions).not.toHaveBeenCalled();
    expect(res.approval_status).toBe('PENDING');
  });

  it('pas de demande possible sans mandat', async () => {
    mocks.db.entreprise.findMany.mockResolvedValue([{ id: 'e1', nom: 'Acme', _count: { mandats: 0 } }]);
    mocks.generateContract.mockResolvedValue(NEEDS('NONE'));
    await call('generate_contract', { company_name: 'Acme', fee_percent: 15, exception_reason: 'x' });
    expect(mocks.requestContractExceptions).not.toHaveBeenCalled();
  });

  it('relaie un mandat ambigu sans générer', async () => {
    mocks.resolveMandat.mockResolvedValue({ error: 'mandate_ambiguous', message: 'Several', candidates: [{ id: 'a' }, { id: 'b' }] });
    expect((await call('generate_contract', { mandate_name: 'Sales' })).error).toBe('mandate_ambiguous');
    expect(mocks.generateContract).not.toHaveBeenCalled();
  });

  it('trouve la société par nom exact, demande de choisir sinon', async () => {
    mocks.db.entreprise.findMany.mockResolvedValue([{ id: 'e1', nom: 'Acme', _count: { mandats: 1 } }, { id: 'e2', nom: 'Acme Holding', _count: { mandats: 0 } }]);
    await call('generate_contract', { company_name: 'acme' });
    expect(mocks.generateContract).toHaveBeenCalledWith(expect.objectContaining({ entrepriseId: 'e1' }), 'u1');
    mocks.db.entreprise.findMany.mockResolvedValue([{ id: 'e1', nom: 'Acme France', _count: { mandats: 1 } }, { id: 'e2', nom: 'Acme Holding', _count: { mandats: 0 } }]);
    expect((await call('generate_contract', { company_name: 'Acme' })).error).toBe('company_ambiguous');
  });

  it('exige une cible', async () => {
    expect((await call('generate_contract', {})).error).toBe('missing_target');
  });

  it('est ouvert aux rôles ADMIN, MANAGER et RECRUTEUR', async () => {
    for (const role of ['ADMIN', 'MANAGER', 'RECRUTEUR']) {
      mocks.user.userRole = role;
      expect((await call('generate_contract', { mandate_id: 'm1' })).success).toBe(true);
    }
  });
});

describe('outils admin de validation', () => {
  it('list_contract_approvals est réservé aux admins', async () => {
    mocks.user.userRole = 'RECRUTEUR';
    expect((await call('list_contract_approvals', {})).error).toContain('not available to the RECRUTEUR role');
    mocks.user.userRole = 'MANAGER';
    expect((await call('list_contract_approvals', {})).error).toContain('not available');
  });

  it('list_contract_approvals montre qui demande quoi et pourquoi', async () => {
    mocks.user.userRole = 'ADMIN';
    mocks.db.contractApproval.findMany.mockResolvedValue([{
      id: 'ap1', requestedById: 'u2', createdAt: new Date('2026-11-21'), reason: 'Client stratégique', feeRequested: '15.00',
      exceptions: { fee_percent: 15, custom_clause: 'Exclusivité 3 mois' },
      mandat: { id: 'm1', titrePoste: 'Head of Sales', feePourcentage: '20.00', entreprise: { nom: 'Acme' } },
    }]);
    mocks.db.user.findMany.mockResolvedValue([{ id: 'u2', prenom: 'Valentin', nom: 'D' }]);
    const res = await call('list_contract_approvals', {});
    expect(res.pending).toBe(1);
    expect(res.requests[0]).toMatchObject({
      approval_id: 'ap1', mandate: 'Head of Sales', company: 'Acme', requested_by: 'Valentin D', reason: 'Client stratégique',
      requested_terms: { fee_percent: 15, custom_clause: 'Exclusivité 3 mois' },
    });
  });

  it('review_contract_approval : refusé hors admin, approuve ou rejette pour un admin', async () => {
    const id = '11111111-2222-3333-4444-555555555555';
    mocks.user.userRole = 'RECRUTEUR';
    expect((await call('review_contract_approval', { approval_id: id, decision: 'approve' })).error).toContain('not available');
    expect(mocks.approve).not.toHaveBeenCalled();

    mocks.user.userRole = 'ADMIN';
    mocks.approve.mockResolvedValue({ id, status: 'APPROVED' });
    expect(await call('review_contract_approval', { approval_id: id, decision: 'approve' })).toMatchObject({ success: true, status: 'APPROVED' });
    expect(mocks.approve).toHaveBeenCalledWith(id, 'u1', 'ADMIN');

    mocks.reject.mockResolvedValue({ id, status: 'REJECTED' });
    expect(await call('review_contract_approval', { approval_id: id, decision: 'reject', note: 'Trop bas' })).toMatchObject({ status: 'REJECTED' });
    expect(mocks.reject).toHaveBeenCalledWith(id, 'u1', 'ADMIN', 'Trop bas');
  });

  it('review_contract_approval refuse un id invalide', async () => {
    mocks.user.userRole = 'ADMIN';
    expect((await call('review_contract_approval', { approval_id: 'abc', decision: 'approve' })).error).toBe('approval_not_found');
  });
});
