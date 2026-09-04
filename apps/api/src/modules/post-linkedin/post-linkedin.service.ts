import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import prisma from '../../lib/db.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../lib/errors.js';

// ── Constantes ─────────────────────────────────────
const STATUTS = ['IDEE', 'A_VALIDER', 'VALIDE', 'PUBLIE'] as const;
type Statut = (typeof STATUTS)[number];

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'posts-linkedin');
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Auteur minimal renvoyé au front (pas de champs sensibles)
const auteurSelect = {
  select: { id: true, prenom: true, nom: true, avatarUrl: true, avatarData: true },
};

const postInclude = {
  auteur: auteurSelect,
  commentaires: {
    orderBy: { createdAt: 'asc' as const },
    include: { auteur: auteurSelect },
  },
};

// ── Helpers ────────────────────────────────────────
function assertStatut(s: string | undefined): Statut | undefined {
  if (s === undefined) return undefined;
  if (!STATUTS.includes(s as Statut)) {
    throw new ValidationError(`Statut invalide: ${s}. Valeurs: ${STATUTS.join(', ')}`);
  }
  return s as Statut;
}

// ── Posts ──────────────────────────────────────────
export async function list(params: { from?: string; to?: string } = {}) {
  const where: Record<string, unknown> = {};
  if (params.from || params.to) {
    where.datePost = {
      ...(params.from ? { gte: new Date(params.from) } : {}),
      ...(params.to ? { lte: new Date(params.to) } : {}),
    };
  }
  return prisma.postLinkedin.findMany({
    where,
    include: postInclude,
    orderBy: { datePost: 'asc' },
  });
}

export async function getById(id: string) {
  const post = await prisma.postLinkedin.findUnique({ where: { id }, include: postInclude });
  if (!post) throw new NotFoundError('Post', id);
  return post;
}

export async function create(
  userId: string,
  data: { datePost: string; texte?: string; imageUrl?: string | null; statut?: string },
) {
  return prisma.postLinkedin.create({
    data: {
      auteurId: userId,
      datePost: new Date(data.datePost),
      texte: data.texte ?? '',
      imageUrl: data.imageUrl ?? null,
      statut: assertStatut(data.statut) ?? 'IDEE',
    },
    include: postInclude,
  });
}

export async function update(
  userId: string,
  role: string,
  id: string,
  data: { datePost?: string; texte?: string; imageUrl?: string | null; statut?: string },
) {
  const post = await prisma.postLinkedin.findUnique({ where: { id } });
  if (!post) throw new NotFoundError('Post', id);
  // L'auteur ou un admin peut editer le contenu. Tout le monde peut faire evoluer
  // le statut (validation collaborative), mais on garde l'edition du texte/image
  // reservee a l'auteur/admin.
  const isOwnerOrAdmin = post.auteurId === userId || role === 'ADMIN';
  const editsContent =
    data.datePost !== undefined || data.texte !== undefined || data.imageUrl !== undefined;
  if (editsContent && !isOwnerOrAdmin) {
    throw new ForbiddenError('Seul l\'auteur peut modifier ce post');
  }
  return prisma.postLinkedin.update({
    where: { id },
    data: {
      ...(data.datePost !== undefined ? { datePost: new Date(data.datePost) } : {}),
      ...(data.texte !== undefined ? { texte: data.texte } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
      ...(data.statut !== undefined ? { statut: assertStatut(data.statut) } : {}),
    },
    include: postInclude,
  });
}

export async function remove(userId: string, role: string, id: string) {
  const post = await prisma.postLinkedin.findUnique({ where: { id } });
  if (!post) throw new NotFoundError('Post', id);
  if (post.auteurId !== userId && role !== 'ADMIN') {
    throw new ForbiddenError('Seul l\'auteur peut supprimer ce post');
  }
  await prisma.postLinkedin.delete({ where: { id } });
  return { ok: true };
}

// ── Commentaires (fil de discussion) ───────────────
export async function addComment(userId: string, postId: string, texte: string) {
  const trimmed = (texte ?? '').trim();
  if (!trimmed) throw new ValidationError('Le commentaire est vide');
  const post = await prisma.postLinkedin.findUnique({ where: { id: postId } });
  if (!post) throw new NotFoundError('Post', postId);
  await prisma.postLinkedinComment.create({
    data: { postId, auteurId: userId, texte: trimmed },
  });
  return getById(postId);
}

export async function removeComment(userId: string, role: string, commentId: string) {
  const comment = await prisma.postLinkedinComment.findUnique({ where: { id: commentId } });
  if (!comment) throw new NotFoundError('Commentaire', commentId);
  if (comment.auteurId !== userId && role !== 'ADMIN') {
    throw new ForbiddenError('Seul l\'auteur peut supprimer ce commentaire');
  }
  await prisma.postLinkedinComment.delete({ where: { id: commentId } });
  return getById(comment.postId);
}

// ── Upload image ───────────────────────────────────
export async function saveImage(fileBuffer: Buffer, originalName: string, mimeType: string) {
  if (!ALLOWED_IMAGE_MIME.has(mimeType)) {
    throw new ValidationError(`Type d'image non autorisé: ${mimeType}. Formats: PNG, JPG, WEBP, GIF`);
  }
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_IMAGE_EXT.has(ext)) {
    throw new ValidationError(`Extension non autorisée: ${ext}`);
  }
  if (fileBuffer.length > MAX_IMAGE_SIZE) {
    throw new ValidationError(`Image trop lourde (max 10 Mo)`);
  }
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `${randomUUID().substring(0, 8)}${ext}`;
  await fs.writeFile(path.join(UPLOADS_DIR, filename), fileBuffer);
  return { url: `/uploads/posts-linkedin/${filename}` };
}
