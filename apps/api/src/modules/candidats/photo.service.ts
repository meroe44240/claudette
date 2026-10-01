import { createRequire } from 'module';
import path from 'path';
import fs from 'fs/promises';
import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { callClaudeWithVision } from '../../services/claudeAI.js';
import * as dossierService from './dossier.service.js';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

// ─── PHOTOS CANDIDATS ───────────────────────────────
// Toutes les photos sont hébergées par l'ATS (uploads/portail) : les liens LinkedIn
// (media.licdn.com) expirent au bout de quelques semaines. Sources :
//   - lien externe posé à la création (extension, Kalent, MCP) → hostIfExternal
//   - visite d'un profil LinkedIn avec l'extension → refreshFromLinkedin
//   - photo intégrée au CV (PDF) → fromCv

const PORTAL_BASE = process.env.PORTAL_BASE_URL || 'https://ats.propium.co';

export function isHosted(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith('/uploads/') || url.startsWith(`${PORTAL_BASE}/uploads/`);
}

// Gravatar est stable : inutile de le recopier.
const needsHosting = (url: string | null | undefined) => !!url && /^https?:\/\//i.test(url) && !isHosted(url) && !/gravatar\.com/i.test(url);

/** Télécharge et héberge la photo si elle pointe vers un site externe. Ne lève jamais. */
export async function hostIfExternal(candidatId: string): Promise<boolean> {
  try {
    const c = await prisma.candidat.findUnique({ where: { id: candidatId }, select: { photoUrl: true } });
    if (!c || !needsHosting(c.photoUrl)) return false;
    await dossierService.setPhotoFromUrl(candidatId, c.photoUrl!);
    return true;
  } catch (e: any) {
    console.warn(`[photo] hébergement impossible pour ${candidatId} : ${e?.message}`);
    return false;
  }
}

const linkedinSlug = (url: string) => (url.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] ?? '').toLowerCase();

/** Appelée par l'extension à la visite d'un profil : met la photo à jour si le candidat existe. */
export async function refreshFromLinkedin(linkedinUrl: string, photoUrl: string) {
  const slug = linkedinSlug(linkedinUrl);
  if (!slug) throw new ValidationError('URL LinkedIn invalide');
  if (!/^https:\/\/[a-z0-9.-]*licdn\.com\//i.test(photoUrl)) throw new ValidationError('Photo LinkedIn invalide');

  const matches = await prisma.candidat.findMany({
    where: { linkedinUrl: { contains: `/in/${slug}`, mode: 'insensitive' } },
    select: { id: true, linkedinUrl: true, photoUrl: true },
    take: 5,
  });
  const cand = matches.find((m) => linkedinSlug(m.linkedinUrl ?? '') === slug);
  if (!cand) return { found: false, updated: false };
  if (isHosted(cand.photoUrl)) return { found: true, updated: false, candidatId: cand.id };

  try {
    await dossierService.setPhotoFromUrl(cand.id, photoUrl);
    return { found: true, updated: true, candidatId: cand.id };
  } catch {
    // Le serveur n'a pas pu télécharger l'image : l'extension l'enverra elle-même.
    return { found: true, updated: false, needsUpload: true, candidatId: cand.id };
  }
}

// ─── Photo du CV ─────────────────────────────────────

async function readCv(cvUrl: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(cvUrl) && !cvUrl.startsWith(`${PORTAL_BASE}/uploads/`)) {
    const res = await fetch(cvUrl, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new ValidationError(`CV introuvable (HTTP ${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
  const rel = decodeURIComponent(cvUrl.replace(PORTAL_BASE, '').replace(/^\//, ''));
  if (!rel.startsWith('uploads/') || rel.includes('..')) throw new ValidationError('Chemin de CV invalide');
  return fs.readFile(path.join(process.cwd(), rel));
}

interface PdfImage { data: Uint8Array; dataUrl?: string; width: number; height: number }

/** Images de la première page qui peuvent être une photo d'identité (carrées ou portrait, assez grandes). */
async function candidateImages(buffer: Buffer): Promise<PdfImage[]> {
  const parser = new PDFParse({ verbosity: 0, data: buffer });
  await parser.load();
  const res = await parser.getImage({ imageThreshold: 80 });
  await parser.destroy();
  const first = (res?.pages ?? []).find((p: any) => p.pageNumber === 1) ?? res?.pages?.[0];
  const images: PdfImage[] = (first?.images ?? []).filter((im: any) => {
    const ratio = im.width / im.height;
    return im.width >= 100 && im.height >= 100 && ratio >= 0.6 && ratio <= 1.25 && im.dataUrl;
  });
  return images.sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 4);
}

async function isPortrait(base64: string, userId: string): Promise<boolean | null> {
  try {
    const res = await callClaudeWithVision({
      feature: 'cv_photo',
      systemPrompt: 'Tu vérifies si une image extraite d\'un CV est la photo d\'identité d\'une personne. Réponds uniquement en JSON : {"portrait": true} ou {"portrait": false}. Un logo, une icône, un pictogramme, un QR code ou une illustration ne sont pas un portrait.',
      userPrompt: 'Cette image est-elle la photo d\'une personne (portrait) ?',
      imageBase64: base64,
      mediaType: 'image/png',
      userId,
      maxTokens: 50,
    });
    return typeof res.content === 'object' ? res.content?.portrait === true : /true/i.test(String(res.content));
  } catch {
    return null; // IA indisponible
  }
}

export async function fromCv(candidatId: string, userId: string) {
  const c = await prisma.candidat.findUnique({ where: { id: candidatId }, select: { cvUrl: true } });
  if (!c) throw new NotFoundError('Candidat', candidatId);
  if (!c.cvUrl) throw new ValidationError("Ce candidat n'a pas de CV");
  if (!/\.pdf($|\?)/i.test(c.cvUrl)) throw new ValidationError('La photo ne peut être extraite que d\'un CV au format PDF');

  const images = await candidateImages(await readCv(c.cvUrl));
  if (images.length === 0) throw new ValidationError('Aucune photo trouvée dans ce CV');

  let chosen: PdfImage | null = null;
  let aiDown = false;
  for (const im of images) {
    const base64 = im.dataUrl!.replace(/^data:image\/\w+;base64,/, '');
    const verdict = await isPortrait(base64, userId);
    if (verdict === true) { chosen = im; break; }
    if (verdict === null) { aiDown = true; break; }
  }
  // Sans IA : on n'accepte que le cas sans ambiguïté (une seule image candidate).
  if (!chosen && aiDown && images.length === 1) chosen = images[0];
  if (!chosen) throw new ValidationError('Aucune photo de personne trouvée dans ce CV');

  const base64 = chosen.dataUrl!.replace(/^data:image\/\w+;base64,/, '');
  const mime = chosen.dataUrl!.match(/^data:(image\/\w+);/)?.[1] ?? 'image/png';
  return dossierService.uploadPhoto(candidatId, Buffer.from(base64, 'base64'), mime);
}

/** À l'import d'un CV : prend la photo du CV si le candidat n'en a pas. Ne lève jamais. */
export async function autoFromCv(candidatId: string, userId: string): Promise<void> {
  try {
    const c = await prisma.candidat.findUnique({ where: { id: candidatId }, select: { photoUrl: true, cvUrl: true } });
    if (!c || c.photoUrl || !c.cvUrl || !/\.pdf($|\?)/i.test(c.cvUrl)) return;
    await fromCv(candidatId, userId);
  } catch {
    // pas de photo dans le CV : rien à faire
  }
}

/** Rattrapage : héberge les photos externes encore valides. */
export async function backfill(limit = 500) {
  const rows = await prisma.candidat.findMany({
    where: { photoUrl: { startsWith: 'http' }, NOT: [{ photoUrl: { startsWith: `${PORTAL_BASE}/uploads/` } }, { photoUrl: { contains: 'gravatar.com' } }] },
    select: { id: true },
    take: limit,
  });
  let ok = 0;
  for (const r of rows) if (await hostIfExternal(r.id)) ok++;
  return { total: rows.length, heberges: ok, echecs: rows.length - ok };
}
