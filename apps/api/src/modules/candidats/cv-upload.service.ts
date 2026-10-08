/**
 * Dépôt d'un CV (PDF) sur une fiche candidat sans passer par l'interface :
 * depuis un lien, un contenu encodé en base64, ou une pièce jointe Gmail du recruteur.
 * Utilisé par l'outil MCP upload_candidate_cv.
 */

import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import * as documentService from '../documents/document.service.js';
import * as photoService from './photo.service.js';
import { getValidAccessToken } from '../integrations/gmail.service.js';

const MAX_SIZE = 10 * 1024 * 1024;
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface CvSource {
  fileUrl?: string;
  fileBase64?: string;
  filename?: string;
  gmailMessageId?: string;
  gmailQuery?: string;
  attachmentName?: string;
}

interface CvFile { buffer: Buffer; filename: string; origin: 'url' | 'base64' | 'gmail'; otherAttachments?: string[] }

const safeName = (name: string | undefined, fallback: string) => {
  const base = (name || fallback).split(/[\\/]/).pop()!.trim() || fallback;
  return /\.pdf$/i.test(base) ? base : `${base}.pdf`;
};

function assertPdf(buffer: Buffer) {
  if (buffer.length === 0) throw new ValidationError('Le fichier est vide.');
  if (buffer.length > MAX_SIZE) throw new ValidationError('Fichier trop volumineux (10 Mo maximum).');
  if (buffer.subarray(0, 1024).indexOf('%PDF') === -1) throw new ValidationError("Ce fichier n'est pas un PDF. Seuls les CV au format PDF sont acceptés.");
}

// ─── Lien ────────────────────────────────────────────

// Lien de partage Google Drive ou Dropbox → lien de téléchargement direct.
function directDownloadUrl(u: URL): URL {
  const drive = u.hostname === 'drive.google.com' ? u.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? u.searchParams.get('id') : null;
  if (drive) return new URL(`https://drive.google.com/uc?export=download&id=${drive}`);
  if (/(^|\.)dropbox\.com$/i.test(u.hostname)) { u.searchParams.set('dl', '1'); return u; }
  return u;
}

async function fromUrl(url: string, filename?: string): Promise<CvFile> {
  let u: URL;
  try { u = new URL(url.trim()); } catch { throw new ValidationError('Lien de CV invalide.'); }
  if (!/^https?:$/.test(u.protocol)) throw new ValidationError('Lien de CV invalide.');
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/i.test(u.hostname)) {
    throw new ValidationError('Lien de CV non autorisé.');
  }
  u = directDownloadUrl(u);
  const res = await fetch(u, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!res.ok) throw new ValidationError(`CV introuvable à cette adresse (HTTP ${res.status}).`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_SIZE) throw new ValidationError('Fichier trop volumineux (10 Mo maximum).');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.subarray(0, 1024).indexOf('%PDF') === -1 && /text\/html/i.test(res.headers.get('content-type') || '')) {
    throw new ValidationError("Ce lien mène à une page web, pas au PDF lui-même (lien privé ou page de connexion ?). Utilisez un lien de téléchargement direct ou un lien partagé « à toute personne disposant du lien ».");
  }
  const fromHeader = res.headers.get('content-disposition')?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)?.[1];
  const fromPath = decodeURIComponent(u.pathname.split('/').pop() || '');
  return { buffer, filename: safeName(filename || (fromHeader ? decodeURIComponent(fromHeader) : /\.pdf$/i.test(fromPath) ? fromPath : undefined), 'cv.pdf'), origin: 'url' };
}

// ─── Gmail ───────────────────────────────────────────

interface GmailPdf { filename: string; attachmentId: string }

function collectPdfs(part: any, out: GmailPdf[]): void {
  if (!part) return;
  if (part.filename && part.body?.attachmentId && (/\.pdf$/i.test(part.filename) || part.mimeType === 'application/pdf')) {
    out.push({ filename: part.filename, attachmentId: part.body.attachmentId });
  }
  for (const p of part.parts || []) collectPdfs(p, out);
}

async function gmailJson(token: string, path: string): Promise<any> {
  const res = await fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (res.status === 404) throw new ValidationError('Email introuvable dans votre boîte Gmail.');
  if (!res.ok) throw new ValidationError(`Gmail a refusé la demande (HTTP ${res.status}). Reconnectez Gmail dans « Mes intégrations » si le problème persiste.`);
  return res.json();
}

async function fromGmail(userId: string, src: CvSource): Promise<CvFile> {
  let token: string;
  try { token = await getValidAccessToken(userId); } catch { throw new ValidationError("Gmail n'est pas connecté pour votre compte : connectez-le dans « Mes intégrations »."); }

  let messageId = src.gmailMessageId?.trim();
  if (!messageId) {
    const q = `${src.gmailQuery!.trim()} has:attachment filename:pdf`;
    const list = await gmailJson(token, `/messages?maxResults=5&q=${encodeURIComponent(q)}`);
    messageId = list.messages?.[0]?.id;
    if (!messageId) throw new ValidationError('Aucun email avec un PDF en pièce jointe ne correspond à cette recherche Gmail.');
  }
  const msg = await gmailJson(token, `/messages/${encodeURIComponent(messageId)}?format=full`);
  const pdfs: GmailPdf[] = [];
  collectPdfs(msg.payload, pdfs);
  if (pdfs.length === 0) throw new ValidationError("Cet email n'a pas de PDF en pièce jointe.");

  const wanted = src.attachmentName?.trim().toLowerCase();
  const pick = (wanted ? pdfs.find((p) => p.filename.toLowerCase().includes(wanted)) : undefined)
    ?? pdfs.find((p) => /\b(cv|resume|résumé|curriculum)\b/i.test(p.filename.replace(/[_.-]/g, ' ')))
    ?? pdfs[0];
  if (wanted && !pick.filename.toLowerCase().includes(wanted)) {
    throw new ValidationError(`Pas de pièce jointe « ${src.attachmentName} » dans cet email. Pièces disponibles : ${pdfs.map((p) => p.filename).join(', ')}`);
  }
  const att = await gmailJson(token, `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(pick.attachmentId)}`);
  const buffer = Buffer.from(String(att.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return { buffer, filename: safeName(src.filename || pick.filename, 'cv.pdf'), origin: 'gmail', otherAttachments: pdfs.filter((p) => p !== pick).map((p) => p.filename) };
}

// ─── Entrée principale ───────────────────────────────

export async function readCvSource(userId: string, src: CvSource): Promise<CvFile> {
  const given = [src.fileUrl, src.fileBase64, src.gmailMessageId || src.gmailQuery].filter(Boolean).length;
  if (given !== 1) throw new ValidationError('Indiquez une seule source pour le CV : un lien, un contenu base64, ou un email Gmail.');
  let file: CvFile;
  if (src.fileUrl) file = await fromUrl(src.fileUrl, src.filename);
  else if (src.fileBase64) {
    const raw = src.fileBase64.replace(/^data:application\/pdf;base64,/i, '').replace(/\s+/g, '');
    file = { buffer: Buffer.from(raw, 'base64'), filename: safeName(src.filename, 'cv.pdf'), origin: 'base64' };
  } else file = await fromGmail(userId, src);
  assertPdf(file.buffer);
  return file;
}

/** Attache le CV à la fiche (remplace l'éventuel CV précédent) ; la photo du CV est reprise si la fiche n'en a pas. */
export async function attachCv(candidatId: string, userId: string, file: CvFile) {
  const candidat = await prisma.candidat.findUnique({ where: { id: candidatId }, select: { id: true, prenom: true, nom: true, cvUrl: true } });
  if (!candidat) throw new NotFoundError('Candidat', candidatId);
  const doc = await documentService.upload('candidat', candidatId, file.buffer, file.filename, 'application/pdf');
  await prisma.candidat.update({ where: { id: candidatId }, data: { cvUrl: doc.url } });
  void photoService.autoFromCv(candidatId, userId);
  return { candidat, cvUrl: doc.url, filename: doc.originalName, size: doc.size, replaced: !!candidat.cvUrl };
}
