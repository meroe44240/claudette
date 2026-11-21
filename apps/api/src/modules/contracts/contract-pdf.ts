/**
 * Rendu PDF du contrat de prestation de recrutement (serveur, sans navigateur).
 *
 * Même contenu que l'export de l'outil web /outils (contract-text.ts), mis en
 * page avec pdfkit : bandeau marine avec les parties, préambule, 19 articles,
 * bloc signatures, pied de page numéroté.
 */

import PDFDocument from 'pdfkit';
import { LOGO_MARK_ON_NAVY_DATA_URI } from '../../lib/brand-assets.js';
import { contractArticles, artHead, PREAMBLE, type ContractForm, type ContractLang } from './contract-text.js';

const NAVY = '#22177A';
const CREAM = '#E6E9AF';
const INK = '#312C4A';
const MUTED = '#6E6A85';

const MARGIN = 56;

export function renderContractPdf(f: ContractForm, lang: ContractLang): Promise<Buffer> {
  const T = (fr: string, en: string) => (lang === 'fr' ? fr : en);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: MARGIN + 10, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: `${T('Contrat', 'Agreement')} - ${f.client || 'HumanUp'}`,
        Author: 'HumanUp Recruitment Agency',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const contentW = pageW - MARGIN * 2;

    // ── Bandeau d'en-tête ──
    const headerH = 190;
    doc.rect(0, 0, pageW, headerH).fill(NAVY);
    try {
      const logo = Buffer.from(LOGO_MARK_ON_NAVY_DATA_URI.split(',')[1], 'base64');
      doc.image(logo, MARGIN, 34, { height: 26 });
    } catch { /* logo facultatif */ }
    doc.font('Helvetica-Bold').fontSize(11).fillColor(CREAM).text('HUMANUP', MARGIN + 36, 41, { characterSpacing: 1.5 });

    doc.font('Helvetica-Bold').fontSize(10).fillColor(CREAM).opacity(0.75)
      .text(T('Contrat de prestation de recrutement', 'Recruitment services agreement'), MARGIN, 80);
    doc.opacity(1).font('Helvetica-Bold').fontSize(20).fillColor(CREAM)
      .text(f.poste || T('Mission de recrutement', 'Recruitment engagement'), MARGIN, 96, { width: contentW, height: 26, ellipsis: true });

    const colW = contentW / 2 - 10;
    const party = (x: number, cap: string, name: string, sub: string) => {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(CREAM).opacity(0.6).text(cap, x, 135, { width: colW });
      doc.opacity(1).font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF').text(name, x, 149, { width: colW, height: 14, ellipsis: true });
      doc.font('Helvetica').fontSize(9).fillColor(CREAM).opacity(0.8).text(sub, x, 165, { width: colW, height: 12, ellipsis: true });
      doc.opacity(1);
    };
    party(MARGIN, T('Le Client', 'The Client'), f.client || '[Client]', `${f.rep || '-'}${f.siret ? ` · ${f.siret}` : ''}`);
    party(MARGIN + colW + 20, T('Le Prestataire', 'The Provider'), 'HumanUp Recruitment Agency', T('Représenté par le consultant en charge', 'Represented by the consultant in charge'));

    doc.x = MARGIN;
    doc.y = headerH + 30;

    // ── Corps ──
    const section = (title: string) => {
      if (doc.y > doc.page.height - MARGIN - 90) doc.addPage();
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(title, MARGIN, doc.y, { width: contentW });
      const y = doc.y + 3;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + contentW, y).lineWidth(0.5).strokeColor('#D9D7E8').stroke();
      doc.y = y + 7;
    };
    const para = (lead: string, text: string) => {
      const opts = { width: contentW, align: 'justify' as const, lineGap: 2.4, paragraphGap: 5 };
      if (lead) {
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(lead, MARGIN, doc.y, { ...opts, continued: true });
        doc.font('Helvetica').text(text, opts);
      } else {
        doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(text, MARGIN, doc.y, opts);
      }
    };

    section(T('Préambule', 'Preamble'));
    para('', PREAMBLE[lang]);
    for (const a of contractArticles(lang, f)) {
      section(artHead(a));
      for (const b of a.blocks) para(b.lead, b.text);
    }

    // ── Signatures ──
    if (doc.y > doc.page.height - MARGIN - 130) doc.addPage();
    doc.moveDown(2);
    const sy = doc.y;
    const sign = (x: number, cap: string, name: string) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(cap, x, sy, { width: colW });
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(T('Date et signature', 'Date and signature'), x, sy + 14, { width: colW });
      doc.moveTo(x, sy + 70).lineTo(x + colW, sy + 70).lineWidth(0.6).strokeColor('#B9B5D0').stroke();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(name, x, sy + 76, { width: colW });
    };
    sign(MARGIN, T('Pour le Client', 'For the Client'), f.rep || f.client || '-');
    sign(MARGIN + colW + 20, T('Pour HumanUp', 'For HumanUp'), 'HumanUp Recruitment Agency');

    // ── Pied de page numéroté ──
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // sinon pdfkit ajoute une page pour le texte sous la marge
      const fy = doc.page.height - MARGIN + 18;
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
        .text(`HumanUp Recruitment Agency · humanup.io`, MARGIN, fy, { width: contentW / 2, lineBreak: false });
      doc.text(`${i + 1} / ${range.count}`, MARGIN + contentW / 2, fy, { width: contentW / 2, align: 'right', lineBreak: false });
    }

    doc.end();
  });
}
