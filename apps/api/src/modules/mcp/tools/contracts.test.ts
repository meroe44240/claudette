import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { userId: 'u1', userRole: 'RECRUTEUR' as string },
  resolveMandat: vi.fn(),
  entrepriseFindUnique: vi.fn(),
  entrepriseFindMany: vi.fn(),
  generateContract: vi.fn(),
  requestApproval: vi.fn(),
}));

vi.mock('../mcp.auth.js', () => ({ getMcpUser: () => mocks.user }));
vi.mock('../mcp.logging.js', () => ({ logMcpAction: vi.fn() }));
vi.mock('./portal.js', () => ({ resolveMandat: mocks.resolveMandat }));
vi.mock('../../../lib/db.js', () => ({ default: { entreprise: { findUnique: mocks.entrepriseFindUnique, findMany: mocks.entrepriseFindMany } } }));
vi.mock('../../contracts/contract-generate.service.js', () => ({ generateContract: mocks.generateContract, FEE_FLOOR: 18 }));
vi.mock('../../contracts/contract.service.js', () => ({ requestApproval: mocks.requestApproval }));

import { registerContractTools } from './contracts.js';

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
const tools: Record<string, Handler> = {};
registerContractTools({ tool: (name: string, _d: string, _s: unknown, h: Handler) => { tools[name] = h; } } as never);

const call = async (args: Record<string, unknown>) => JSON.parse((await tools.generate_contract(args)).content[0].text);

const OK = {
  ok: true, url: 'https://ats.propium.co/uploads/documents/mandat/m1/x_Contrat.pdf', filename: 'Contrat.pdf', sizeBytes: 1000, lang: 'fr',
  mandatId: 'm1', entrepriseId: 'e1', missing: [],
  terms: { client: 'Acme', siret: '123', adresse: 'Paris', rep: 'Claire Martin', email: 'c@acme.fr', pays: 'France', feePct: '20', garantieMois: '3', proprieteMois: '12', paiement: '30 jours date de facture', poste: 'Head of Sales' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.userRole = 'RECRUTEUR';
  mocks.resolveMandat.mockResolvedValue({ id: 'm1', titrePoste: 'Head of Sales', entreprise: 'Acme', client: null });
  mocks.generateContract.mockResolvedValue(OK);
});

describe('generate_contract (MCP)', () => {
  it('est enregistré', () => {
    expect(tools.generate_contract).toBeTypeOf('function');
  });

  it('génère depuis un nom de mandat et renvoie le lien et les termes', async () => {
    const res = await call({ mandate_name: 'Head of Sales', fee_percent: 20, language: 'fr' });
    expect(mocks.resolveMandat).toHaveBeenCalledWith(expect.objectContaining({ mandate_name: 'Head of Sales' }));
    expect(mocks.generateContract).toHaveBeenCalledWith(expect.objectContaining({ mandatId: 'm1', entrepriseId: undefined, feePct: 20, lang: 'fr' }), 'u1');
    expect(res).toMatchObject({ success: true, pdf_url: OK.url, mandate_id: 'm1' });
    expect(res.terms).toMatchObject({ client: 'Acme', fee_percent: 20, governing_law: 'France', guarantee_months: 3, ownership_months: 12 });
    expect(res.message).toContain('Nothing was sent to the client');
  });

  it('transmet les surcharges (langue, pays, paiement, signataire)', async () => {
    await call({ mandate_id: 'm1', language: 'en', country: 'GB', payment_terms: '60j', signatory_name: ' John ', guarantee_months: 6 });
    expect(mocks.generateContract).toHaveBeenCalledWith(expect.objectContaining({ lang: 'en', country: 'GB', paymentTerms: '60j', signatoryName: 'John', guaranteeMonths: 6 }), 'u1');
  });

  it('relaie un mandat ambigu sans générer', async () => {
    mocks.resolveMandat.mockResolvedValue({ error: 'mandate_ambiguous', message: 'Several', candidates: [{ id: 'a' }, { id: 'b' }] });
    const res = await call({ mandate_name: 'Sales' });
    expect(res.error).toBe('mandate_ambiguous');
    expect(mocks.generateContract).not.toHaveBeenCalled();
  });

  it('trouve la société par nom exact quand il n’y a pas de mandat', async () => {
    mocks.entrepriseFindMany.mockResolvedValue([
      { id: 'e1', nom: 'Acme', _count: { mandats: 1 } },
      { id: 'e2', nom: 'Acme Holding', _count: { mandats: 0 } },
    ]);
    await call({ company_name: 'acme' });
    expect(mocks.generateContract).toHaveBeenCalledWith(expect.objectContaining({ entrepriseId: 'e1', mandatId: undefined }), 'u1');
  });

  it('demande de choisir quand plusieurs sociétés correspondent', async () => {
    mocks.entrepriseFindMany.mockResolvedValue([
      { id: 'e1', nom: 'Acme France', _count: { mandats: 1 } },
      { id: 'e2', nom: 'Acme Holding', _count: { mandats: 0 } },
    ]);
    const res = await call({ company_name: 'Acme' });
    expect(res.error).toBe('company_ambiguous');
    expect(res.candidates).toHaveLength(2);
    expect(mocks.generateContract).not.toHaveBeenCalled();
  });

  it('refuse un company_id qui n’est pas un UUID', async () => {
    const res = await call({ company_id: 'acme' });
    expect(res.error).toBe('company_not_found');
  });

  it('exige une cible', async () => {
    const res = await call({});
    expect(res.error).toBe('missing_target');
  });

  it('sous 18 % sans raison : refuse sans créer de demande', async () => {
    mocks.generateContract.mockResolvedValue({ ok: false, error: 'needs_admin_approval', approvalStatus: 'NONE', message: 'below floor' });
    const res = await call({ mandate_id: 'm1', fee_percent: 15 });
    expect(res.error).toBe('needs_admin_approval');
    expect(mocks.requestApproval).not.toHaveBeenCalled();
  });

  it('sous 18 % avec raison : envoie la demande de validation aux admins', async () => {
    mocks.generateContract.mockResolvedValue({ ok: false, error: 'needs_admin_approval', approvalStatus: 'NONE', message: 'below floor' });
    mocks.requestApproval.mockResolvedValue({ id: 'ap1' });
    const res = await call({ mandate_id: 'm1', fee_percent: 15, discount_reason: 'Client stratégique, volume 5 postes' });
    expect(mocks.requestApproval).toHaveBeenCalledWith({ mandatId: 'm1', feeRequested: 15, reason: 'Client stratégique, volume 5 postes' }, 'u1');
    expect(res).toMatchObject({ error: 'needs_admin_approval', approval_requested: true, approval_id: 'ap1' });
  });

  it('ne recrée pas de demande si une est déjà en attente', async () => {
    mocks.generateContract.mockResolvedValue({ ok: false, error: 'needs_admin_approval', approvalStatus: 'PENDING', message: 'pending' });
    const res = await call({ mandate_id: 'm1', fee_percent: 15, discount_reason: 'x' });
    expect(mocks.requestApproval).not.toHaveBeenCalled();
    expect(res.message).toBe('pending');
  });

  it('signale les champs manquants dans le message', async () => {
    mocks.generateContract.mockResolvedValue({ ...OK, missing: ['address', 'signatory_email'] });
    const res = await call({ mandate_id: 'm1' });
    expect(res.missing).toEqual(['address', 'signatory_email']);
    expect(res.message).toContain('address, signatory_email');
  });

  it('est ouvert aux rôles ADMIN, MANAGER et RECRUTEUR', async () => {
    for (const role of ['ADMIN', 'MANAGER', 'RECRUTEUR']) {
      mocks.user.userRole = role;
      expect((await call({ mandate_id: 'm1' })).success).toBe(true);
    }
  });
});
