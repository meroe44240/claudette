/**
 * generate_contract de bout en bout sur une vraie base : lecture du mandat,
 * rendu PDF, écriture du fichier dans uploads/, activité avec pièce jointe,
 * règle des 18 %, et appel via l'outil MCP avec un utilisateur MCP.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';
import prisma from '../../lib/db.js';
import { generateContract } from './contract-generate.service.js';
import { registerContractTools } from '../mcp/tools/contracts.js';
import { runWithMcpUser } from '../mcp/mcp.auth.js';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const PREFIX = 'TestContrat';
let userId: string;
let adminId: string;
let entrepriseId: string;
let entrepriseSansMandatId: string;
let mandatId: string;
const writtenDirs: string[] = [];

const localPath = (url: string) => path.join(process.cwd(), new URL(url).pathname.replace(/^\/+/, ''));

async function pdfText(file: string): Promise<string> {
  const parser = new PDFParse({ verbosity: 0, data: await fs.readFile(file) });
  const res = await parser.getText();
  return String(res.text).replace(/\s+/g, ' ');
}

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: 'contract-test@humanup.io' },
    update: {},
    create: { email: 'contract-test@humanup.io', passwordHash: 'x', nom: 'ContractTest', role: 'RECRUTEUR', mustChangePassword: false },
  });
  userId = user.id;
  const admin = await prisma.user.upsert({
    where: { email: 'contract-admin-test@humanup.io' },
    update: {},
    create: { email: 'contract-admin-test@humanup.io', passwordHash: 'x', nom: 'ContractAdmin', role: 'ADMIN', mustChangePassword: false },
  });
  adminId = admin.id;

  const e = await prisma.entreprise.create({
    data: { nom: `${PREFIX} Acme SAS`, siret: '12345678900012', adresseComplete: '12 rue de la Paix, 75002 Paris' },
  });
  entrepriseId = e.id;
  const client = await prisma.client.create({
    data: { nom: 'Martin', prenom: 'Claire', email: 'claire@acme-test.fr', entrepriseId },
  });
  const m = await prisma.mandat.create({
    data: {
      titrePoste: `${PREFIX} Head of Sales`, entrepriseId, clientId: client.id,
      feePourcentage: 22, paymentTerms: '45j_fdm', applicableCountry: 'FR',
    },
  });
  mandatId = m.id;

  const e2 = await prisma.entreprise.create({ data: { nom: `${PREFIX} Solo Ltd` } });
  entrepriseSansMandatId = e2.id;
  writtenDirs.push(
    path.join(process.cwd(), 'uploads', 'documents', 'mandat', mandatId),
    path.join(process.cwd(), 'uploads', 'documents', 'entreprise', entrepriseSansMandatId),
  );
});

afterAll(async () => {
  await prisma.activite.deleteMany({ where: { entiteId: { in: [mandatId, entrepriseSansMandatId] } } });
  await prisma.contractApproval.deleteMany({ where: { mandatId } });
  await prisma.mandat.deleteMany({ where: { titrePoste: { startsWith: PREFIX } } });
  await prisma.client.deleteMany({ where: { email: 'claire@acme-test.fr' } });
  await prisma.entreprise.deleteMany({ where: { nom: { startsWith: PREFIX } } });
  await prisma.mcpActionLog.deleteMany({ where: { userId: { in: [userId, adminId] } } });
  await prisma.user.deleteMany({ where: { email: { in: ['contract-test@humanup.io', 'contract-admin-test@humanup.io'] } } }).catch(() => undefined);
  for (const d of writtenDirs) await fs.rm(d, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('generateContract (base réelle)', () => {
  it('génère le PDF du mandat, l’écrit sur disque et trace l’activité', async () => {
    const r = await generateContract({ mandatId }, userId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.terms).toMatchObject({
      client: `${PREFIX} Acme SAS`, siret: '12345678900012', adresse: '12 rue de la Paix, 75002 Paris',
      rep: 'Claire Martin', email: 'claire@acme-test.fr', feePct: '22', paiement: '45 jours fin de mois',
      pays: 'France', poste: `${PREFIX} Head of Sales`,
    });
    expect(r.missing).toEqual([]);
    expect(r.url).toMatch(new RegExp(`/uploads/documents/mandat/${mandatId}/[0-9a-f]{8}_Contrat_HumanUp_TestContrat_Acme_SAS\\.pdf$`));

    const file = localPath(r.url);
    const stat = await fs.stat(file);
    expect(stat.size).toBe(r.sizeBytes);
    const text = await pdfText(file);
    expect(text).toContain('Contrat de prestation de recrutement');
    expect(text).toContain('22 % du package annuel brut');
    expect(text).toContain('45 jours fin de mois');
    expect(text).toContain('Claire Martin');

    const act = await prisma.activite.findFirst({ where: { entiteId: mandatId, titre: 'Contrat généré' }, include: { fichiers: true } });
    expect(act).toMatchObject({ entiteType: 'MANDAT', userId, source: 'AGENT_IA' });
    expect(act!.fichiers).toHaveLength(1);
    expect(act!.fichiers[0]).toMatchObject({ url: r.url, mimeType: 'application/pdf', taille: r.sizeBytes });

    const mandat = await prisma.mandat.findUnique({ where: { id: mandatId } });
    expect(mandat!.contractStatus).toBe('DRAFT');
    expect(mandat!.contractSentAt).toBeNull();
  });

  it('refuse 15 % sans validation puis génère une fois la validation approuvée', async () => {
    const refused = await generateContract({ mandatId, feePct: 15 }, userId);
    expect(refused).toMatchObject({ ok: false, error: 'needs_admin_approval', approvalStatus: 'NONE' });

    await prisma.contractApproval.create({
      data: { mandatId, feeRequested: 15, reason: 'test', requestedById: userId, status: 'APPROVED', approvedAt: new Date(), approvedById: userId },
    });
    const ok = await generateContract({ mandatId, feePct: 15, lang: 'en' }, userId);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      const text = await pdfText(localPath(ok.url));
      expect(text).toContain('15 % of the annual gross package');
    }
  });

  it('génère depuis une société sans mandat ni contact et liste ce qui manque', async () => {
    const r = await generateContract({ entrepriseId: entrepriseSansMandatId }, userId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.missing).toEqual(['address', 'registration', 'signatory_name', 'signatory_email']);
    expect(r.url).toContain(`/uploads/documents/entreprise/${entrepriseSansMandatId}/`);
    await expect(fs.stat(localPath(r.url))).resolves.toBeTruthy();
  });
});

describe('outil MCP generate_contract (base réelle)', () => {
  type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ text: string }> }>;
  const tools: Record<string, Handler> = {};
  registerContractTools({ tool: (name: string, _d: string, _s: unknown, h: Handler) => { tools[name] = h; } } as never);

  const as = (who: 'recruiter' | 'admin', tool: string, args: Record<string, unknown>) =>
    runWithMcpUser(
      (who === 'admin' ? { userId: adminId, userRole: 'ADMIN' } : { userId, userRole: 'RECRUTEUR' }) as never,
      async () => JSON.parse((await tools[tool](args)).content[0].text),
    );
  const call = (args: Record<string, unknown>) => as('recruiter', 'generate_contract', args);

  it('génère par nom de société et renvoie un lien vers un PDF existant', async () => {
    const res = await call({ company_name: `${PREFIX} Acme SAS`, fee_percent: 20 });
    expect(res.success).toBe(true);
    expect(res.terms).toMatchObject({ client: `${PREFIX} Acme SAS`, fee_percent: 20, signatory: 'Claire Martin' });
    await expect(fs.stat(localPath(res.pdf_url))).resolves.toBeTruthy();
  });

  it('génère par id de mandat', async () => {
    const res = await call({ mandate_id: mandatId, language: 'en' });
    expect(res).toMatchObject({ success: true, mandate_id: mandatId, language: 'en' });
  });

  it('renvoie une erreur lisible pour un mandat inconnu', async () => {
    const res = await call({ mandate_id: '00000000-0000-0000-0000-000000000000' });
    expect(res.error).toBe('mandate_not_found');
  });

  it('circuit complet : aperçu, demande, validation admin, génération avec l’article 19', async () => {
    const clause = 'Mission confiée en exclusivité au Prestataire pendant 3 mois.';
    const terms = { mandate_id: mandatId, guarantee_months: 9, special_conditions: clause };

    // 1. aperçu : rien n'est généré, la validation est annoncée
    const preview = await call({ ...terms, preview: true });
    expect(preview).toMatchObject({ preview: true, approval: 'required' });
    expect(preview.articles).toHaveLength(20);
    expect(preview.non_standard_terms).toHaveLength(2);

    // 2. génération refusée tant que rien n'est validé
    expect((await call(terms)).error).toBe('needs_admin_approval');

    // 3. demande envoyée avec une raison, stockée avec les valeurs exactes
    const asked = await call({ ...terms, exception_reason: 'Client stratégique, 5 postes à venir' });
    expect(asked).toMatchObject({ approval_requested: true });
    const row = await prisma.contractApproval.findUnique({ where: { id: asked.approval_id } });
    expect(row).toMatchObject({ status: 'PENDING', reason: 'Client stratégique, 5 postes à venir', exceptions: { guarantee_months: 9, custom_clause: clause } });

    // 4. redemander ne crée pas de doublon
    const again = await call({ ...terms, exception_reason: 'idem' });
    expect(again.approval_status).toBe('PENDING');
    expect(await prisma.contractApproval.count({ where: { mandatId, status: 'PENDING' } })).toBe(1);

    // 5. un recruteur ne peut ni lister ni valider
    expect((await as('recruiter', 'list_contract_approvals', {})).error).toContain('not available');
    expect((await as('recruiter', 'review_contract_approval', { approval_id: asked.approval_id, decision: 'approve' })).error).toContain('not available');

    // 6. l'admin voit la demande et la valide
    const list = await as('admin', 'list_contract_approvals', {});
    const mine = list.requests.find((r: { approval_id: string }) => r.approval_id === asked.approval_id);
    expect(mine).toMatchObject({ requested_by: 'ContractTest', requested_terms: { guarantee_months: 9, custom_clause: clause } });
    expect(await as('admin', 'review_contract_approval', { approval_id: asked.approval_id, decision: 'approve' })).toMatchObject({ status: 'APPROVED' });

    // 7. une clause modifiée d'un mot n'est pas couverte par la validation
    expect((await call({ ...terms, special_conditions: clause.replace('3 mois', '6 mois') })).error).toBe('needs_admin_approval');

    // 8. avec exactement les valeurs validées, le contrat sort avec l'article 19
    const done = await call(terms);
    expect(done.success).toBe(true);
    expect(done.content).toMatchObject({ guarantee_months: 9, special_conditions: clause });
    const text = await pdfText(localPath(done.pdf_url));
    expect(text).toContain('Article 19 - Conditions particulières');
    expect(text).toContain(clause);
    expect(text).toContain('dans la limite de 9 mois');
  });
});
