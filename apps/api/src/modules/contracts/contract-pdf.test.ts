import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import { renderContractPdf } from './contract-pdf.js';
import { contractArticles, type ContractForm } from './contract-text.js';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const form: ContractForm = {
  client: 'Acme Industries SAS', siret: '12345678900012', adresse: '12 rue de la Paix, 75002 Paris',
  rep: 'Claire Martin', email: 'claire.martin@acme.fr', pays: 'France', feePct: '22',
  garantieMois: '4', proprieteMois: '18', paiement: '45 jours fin de mois', poste: 'Head of Sales France',
};

async function pdfText(buf: Buffer): Promise<{ text: string; pages: number }> {
  const parser = new PDFParse({ verbosity: 0, data: buf });
  const res = await parser.getText();
  await parser.destroy?.();
  // pdf-parse peut couper les lignes justifiées : on normalise les espaces
  return { text: String(res.text).replace(/\s+/g, ' '), pages: res.total ?? res.pages?.length ?? 0 };
}

describe('contractArticles', () => {
  it('contient les 19 articles (1 à 18 + 8 bis) dans les deux langues', () => {
    for (const lang of ['fr', 'en'] as const) {
      const nums = contractArticles(lang, form).map((a) => a.num);
      expect(nums).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '8bis', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18']);
    }
  });

  it('injecte fee, garantie, propriété, paiement, pays et coordonnées du client', () => {
    const all = contractArticles('fr', form).flatMap((a) => a.blocks.map((b) => b.lead + b.text)).join(' ');
    expect(all).toContain('22 % du package annuel brut');
    expect(all).toContain('limite de 4 mois');
    expect(all).toContain('durée de 18 mois');
    expect(all).toContain('45 jours fin de mois');
    expect(all).toContain('régi par le droit de France');
    expect(all).toContain('Acme Industries SAS : 12 rue de la Paix, 75002 Paris / claire.martin@acme.fr');
  });

  it('met des emplacements à compléter quand l’adresse manque', () => {
    const fr = contractArticles('fr', { ...form, adresse: '', email: '' }).find((a) => a.num === '12')!;
    expect(fr.blocks[1].text).toBe('Acme Industries SAS : [adresse]');
    const en = contractArticles('en', { ...form, adresse: '', email: '' }).find((a) => a.num === '12')!;
    expect(en.blocks[1].text).toBe('Acme Industries SAS : [address]');
  });
});

describe('renderContractPdf', () => {
  it('produit un PDF valide en français avec les parties, le fee et les signatures', async () => {
    const buf = await renderContractPdf(form, 'fr');
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const { text, pages } = await pdfText(buf);
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(text).toContain('Contrat de prestation de recrutement');
    expect(text).toContain('Head of Sales France');
    expect(text).toContain('Acme Industries SAS');
    expect(text).toContain('Claire Martin · 12345678900012');
    expect(text).toContain('Article 8 bis - Référence et communication');
    expect(text).toContain('Article 18 - Loi applicable');
    expect(text).toContain('22 % du package annuel brut');
    expect(text).toContain('Pour le Client');
    expect(text).toContain(`1 / ${pages}`);
    expect(text).toContain(`${pages} / ${pages}`);
  });

  it('produit la version anglaise', async () => {
    const { text } = await pdfText(await renderContractPdf({ ...form, pays: 'England and Wales' }, 'en'));
    expect(text).toContain('Recruitment services agreement');
    expect(text).toContain('Article 4 - Fees');
    expect(text).toContain('governed by the law of England and Wales');
    expect(text).toContain('For the Client');
    expect(text).not.toContain('Préambule');
  });

  it('garde les accents, apostrophes typographiques et le signe euro', async () => {
    const { text } = await pdfText(await renderContractPdf(form, 'fr'));
    expect(text).toContain('Rémunération');
    expect(text).toContain('l’Article 5');
    expect(text).toContain('(40 €)');
  });

  it('n’ajoute pas de page blanche à cause du pied de page', async () => {
    const { text, pages } = await pdfText(await renderContractPdf(form, 'fr'));
    // chaque page a son numéro, aucune page en trop
    for (let i = 1; i <= pages; i++) expect(text).toContain(`${i} / ${pages}`);
    expect(pages).toBeLessThanOrEqual(5);
  });

  it('ajoute l’article 19 « Conditions particulières » quand une clause est fournie', async () => {
    const { text } = await pdfText(await renderContractPdf(form, 'fr', { customClause: 'Exclusivité de 3 mois sur le poste.\nRevue au bout de 60 jours.' }));
    expect(text).toContain('Article 19 - Conditions particulières');
    expect(text).toContain('Exclusivité de 3 mois sur le poste.');
    expect(text).toContain('Revue au bout de 60 jours.');
    const en = await pdfText(await renderContractPdf(form, 'en', { customClause: 'Exclusive search.' }));
    expect(en.text).toContain('Article 19 - Special conditions');
  });

  it('pas d’article 19 sans clause', async () => {
    const { text } = await pdfText(await renderContractPdf(form, 'fr', { customClause: '   ' }));
    expect(text).not.toContain('Article 19');
  });

  it('remplace le client vide par un emplacement', async () => {
    const { text } = await pdfText(await renderContractPdf({ ...form, client: '', rep: '', poste: '' }, 'fr'));
    expect(text).toContain('[Client]');
    expect(text).toContain('Mission de recrutement');
  });
});
