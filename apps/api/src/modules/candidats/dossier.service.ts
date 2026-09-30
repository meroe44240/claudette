import path from 'path';
import fs from 'fs/promises';
import { randomBytes } from 'crypto';
import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';

// ─── DOSSIER CLIENT ─────────────────────────────────
// Ce que le client voit sur le portail pour un candidat :
//   photo            → candidat.photoUrl
//   synthèse         → candidat.aiPitchShort
//   cartes d'infos   → aiAnonymizedProfile.infos [{label, value}]
//   adéquation poste → aiAnonymizedProfile.bulletPoints
//   parcours, etc.   → aiAnonymizedProfile.sections [{title, items}]
//   coordonnées + CV → affichés seulement si aiAnonymizedProfile.coordonneesVisibles
// Un dossier retouché à la main est marqué `dossierManuel` : le parsing d'un
// nouveau CV ne l'écrase plus (voir cv-parsing.service).

const PORTAL_BASE = process.env.PORTAL_BASE_URL || 'https://ats.propium.co';
const PHOTO_DIR = path.join(process.cwd(), 'uploads', 'portail');
const MAX_PHOTO = 5 * 1024 * 1024;
const PHOTO_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface DossierInfo { label: string; value: string }
export interface DossierSection { title: string; items: string[] }
export interface Dossier {
  candidatId: string;
  nom: string;
  prenom: string | null;
  posteActuel: string | null;
  entrepriseActuelle: string | null;
  photoUrl: string | null;
  contact: { email: string | null; telephone: string | null; linkedinUrl: string | null; cvUrl: string | null };
  synthese: string;
  infos: DossierInfo[];
  adequation: string[];
  sections: DossierSection[];
  manuel: boolean;
  coordonneesVisibles: boolean;
  modifieLe: string | null;
}

export interface DossierInput {
  synthese?: string | null;
  infos?: DossierInfo[];
  adequation?: string[];
  sections?: DossierSection[];
  manuel?: boolean;
  coordonneesVisibles?: boolean;
}

function asProfile(v: unknown): Record<string, any> {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, any>) } : {};
}

function toDossier(c: any): Dossier {
  const p = asProfile(c.aiAnonymizedProfile);
  const bullets = Array.isArray(p.bulletPoints) ? p.bulletPoints : Array.isArray(p.highlights) ? p.highlights : [];
  return {
    candidatId: c.id,
    nom: c.nom,
    prenom: c.prenom,
    posteActuel: c.posteActuel,
    entrepriseActuelle: c.entrepriseActuelle,
    photoUrl: c.photoUrl,
    contact: { email: c.email, telephone: c.telephone, linkedinUrl: c.linkedinUrl, cvUrl: c.cvUrl },
    synthese: c.aiPitchShort || '',
    infos: Array.isArray(p.infos) ? p.infos.filter((i: any) => i && typeof i.label === 'string').map((i: any) => ({ label: i.label, value: String(i.value ?? '') })) : [],
    adequation: bullets.filter((b: any) => typeof b === 'string'),
    sections: Array.isArray(p.sections) ? p.sections.filter((s: any) => s && typeof s.title === 'string').map((s: any) => ({ title: s.title, items: Array.isArray(s.items) ? s.items.map(String) : [] })) : [],
    manuel: p.dossierManuel === true,
    coordonneesVisibles: p.coordonneesVisibles === true,
    modifieLe: typeof p.dossierModifieLe === 'string' ? p.dossierModifieLe : null,
  };
}

const SELECT = { id: true, nom: true, prenom: true, posteActuel: true, entrepriseActuelle: true, photoUrl: true, aiPitchShort: true, aiAnonymizedProfile: true, email: true, telephone: true, linkedinUrl: true, cvUrl: true } as const;

export async function getDossier(candidatId: string): Promise<Dossier> {
  const c = await prisma.candidat.findUnique({ where: { id: candidatId }, select: SELECT });
  if (!c) throw new NotFoundError('Candidat', candidatId);
  return toDossier(c);
}

const clean = (s: unknown) => String(s ?? '').trim();

export async function updateDossier(candidatId: string, input: DossierInput): Promise<Dossier> {
  const c = await prisma.candidat.findUnique({ where: { id: candidatId }, select: SELECT });
  if (!c) throw new NotFoundError('Candidat', candidatId);

  const profile = asProfile(c.aiAnonymizedProfile);
  const data: Record<string, any> = {};

  if (input.synthese !== undefined) {
    const synthese = clean(input.synthese);
    // candidats.ai_pitch_short est un VarChar(500)
    if (synthese.length > 500) throw new ValidationError(`La synthèse fait ${synthese.length} caractères, 500 maximum`);
    data.aiPitchShort = synthese || null;
  }
  if (input.infos !== undefined) {
    profile.infos = input.infos.map((i) => ({ label: clean(i.label), value: clean(i.value) })).filter((i) => i.label && i.value);
  }
  if (input.adequation !== undefined) {
    profile.bulletPoints = input.adequation.map(clean).filter(Boolean);
    delete profile.highlights;
  }
  if (input.sections !== undefined) {
    profile.sections = input.sections
      .map((s) => ({ title: clean(s.title), items: (s.items || []).map(clean).filter(Boolean) }))
      .filter((s) => s.title && s.items.length > 0);
  }
  // Toute retouche verrouille le dossier contre le parsing CV, sauf demande explicite.
  if (input.coordonneesVisibles !== undefined) profile.coordonneesVisibles = input.coordonneesVisibles;
  profile.dossierManuel = input.manuel ?? true;
  profile.dossierModifieLe = new Date().toISOString();
  data.aiAnonymizedProfile = profile;

  const updated = await prisma.candidat.update({ where: { id: candidatId }, data, select: SELECT });
  return toDossier(updated);
}

async function storePhoto(candidatId: string, buffer: Buffer, mime: string): Promise<Dossier> {
  const ext = PHOTO_EXT[mime.toLowerCase()];
  if (!ext) throw new ValidationError('Format de photo non accepté (JPG, PNG ou WebP)');
  if (buffer.length > MAX_PHOTO) throw new ValidationError('Photo trop lourde (max 5 Mo)');
  const exists = await prisma.candidat.findUnique({ where: { id: candidatId }, select: { id: true } });
  if (!exists) throw new NotFoundError('Candidat', candidatId);

  await fs.mkdir(PHOTO_DIR, { recursive: true });
  const filename = `${randomBytes(16).toString('hex')}.${ext}`;
  await fs.writeFile(path.join(PHOTO_DIR, filename), buffer);
  await prisma.candidat.update({ where: { id: candidatId }, data: { photoUrl: `${PORTAL_BASE}/uploads/portail/${filename}` } });
  return getDossier(candidatId);
}

export function uploadPhoto(candidatId: string, buffer: Buffer, mime: string) {
  return storePhoto(candidatId, buffer, mime);
}

// Photo depuis une URL (MCP) : on la télécharge et on l'héberge chez nous,
// pour ne pas dépendre d'un lien LinkedIn qui expire.
export async function setPhotoFromUrl(candidatId: string, url: string): Promise<Dossier> {
  let u: URL;
  try { u = new URL(url); } catch { throw new ValidationError('URL de photo invalide'); }
  if (!/^https?:$/.test(u.protocol)) throw new ValidationError('URL de photo invalide');
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/i.test(u.hostname)) {
    throw new ValidationError('URL de photo non autorisée');
  }
  const res = await fetch(u, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!res.ok) throw new ValidationError(`Photo introuvable (HTTP ${res.status})`);
  const mime = (res.headers.get('content-type') || '').split(';')[0].trim();
  const buffer = Buffer.from(await res.arrayBuffer());
  return storePhoto(candidatId, buffer, mime);
}

export async function removePhoto(candidatId: string): Promise<Dossier> {
  await prisma.candidat.update({ where: { id: candidatId }, data: { photoUrl: null } });
  return getDossier(candidatId);
}
