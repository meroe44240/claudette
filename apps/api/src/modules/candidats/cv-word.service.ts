/**
 * CV au format Word (.docx) : l'ATS travaille en PDF (aperçu, photo, portail client).
 * Le texte du .docx est mis en page dans un PDF qui devient le CV de la fiche ;
 * le fichier Word d'origine est gardé dans les documents de la fiche.
 */

import PDFDocument from 'pdfkit';
import * as documentService from '../documents/document.service.js';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_SIZE = 10 * 1024 * 1024;

export const isDocx = (filename: string, mime?: string) =>
  mime === DOCX_MIME || /\.docx$/i.test(filename);

/** Texte brut d'un .docx. */
export async function docxText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await (mammoth as any).extractRawText({ buffer });
  return String(value || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Met le texte du CV en page dans un PDF simple (A4, Helvetica). */
export function textToPdf(text: string, title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 56, right: 56 }, info: { Title: title } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#8A8699').text(title, { align: 'right' });
    doc.moveDown(1.2);
    const lines = text.split('\n');
    for (const line of lines) {
      const l = line.trim();
      if (!l) { doc.moveDown(0.5); continue; }
      // Ligne courte en majuscules ou terminée par « : » = titre de section.
      const isHeading = l.length < 60 && (l === l.toUpperCase() && /\p{L}/u.test(l) || /:$/.test(l));
      doc.font(isHeading ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeading ? 11.5 : 10).fillColor('#1A1533')
        .text(l, { lineGap: 2 });
    }
    doc.end();
  });
}

/**
 * Word → PDF pour la fiche. Le .docx d'origine est rangé dans les documents du candidat.
 * Retourne le PDF à attacher comme CV.
 */
export async function wordCvToPdf(candidatId: string, buffer: Buffer, filename: string): Promise<{ buffer: Buffer; filename: string }> {
  if (buffer.length === 0 || buffer.length > MAX_SIZE) throw new Error('CV Word vide ou trop volumineux (10 Mo maximum).');
  const text = await docxText(buffer);
  if (text.length < 40) throw new Error('CV Word illisible (aucun texte trouvé).');
  await documentService.upload('candidat', candidatId, buffer, filename, DOCX_MIME);
  const base = filename.replace(/\.docx$/i, '');
  const pdf = await textToPdf(text, base);
  return { buffer: pdf, filename: `${base}.pdf` };
}
