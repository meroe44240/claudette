import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { ValidationError, NotFoundError } from '../../lib/errors.js';

// ── Types ──────────────────────────────────────────

export type EntityType = 'candidat' | 'client' | 'entreprise' | 'mandat';

export interface DocumentMeta {
  id: string;
  filename: string;
  originalName: string;
  url: string;
  mimeType: string;
  size: number;
  entityType: EntityType;
  entityId: string;
  createdAt: string;
}

// ── Constants ──────────────────────────────────────

const UPLOADS_ROOT = path.join(process.cwd(), 'uploads', 'documents');

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/jpg',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.png',
  '.jpg',
  '.jpeg',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ── Helpers ────────────────────────────────────────

function getEntityDir(entityType: EntityType, entityId: string): string {
  return path.join(UPLOADS_ROOT, entityType, entityId);
}

function getDocumentUrl(entityType: EntityType, entityId: string, filename: string): string {
  return `/uploads/documents/${entityType}/${entityId}/${filename}`;
}

function sanitizeFilename(original: string): string {
  // Replace problematic characters, keep extension
  const ext = path.extname(original).toLowerCase();
  const base = path.basename(original, ext)
    .replace(/[^a-zA-Z0-9_\-\u00C0-\u024F]/g, '_') // allow accented chars
    .replace(/_+/g, '_')
    .substring(0, 100);
  return `${base}${ext}`;
}

// ── Service Methods ────────────────────────────────

export async function upload(
  entityType: EntityType,
  entityId: string,
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<DocumentMeta> {
  // Validate mime type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ValidationError(
      `Type de fichier non autoris\u00e9: ${mimeType}. Types accept\u00e9s: PDF, DOC, DOCX, PNG, JPG`,
    );
  }

  // Validate extension
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new ValidationError(
      `Extension de fichier non autoris\u00e9e: ${ext}. Extensions accept\u00e9es: .pdf, .doc, .docx, .png, .jpg, .jpeg`,
    );
  }

  // Validate file size
  if (fileBuffer.length > MAX_FILE_SIZE) {
    throw new ValidationError(
      `Taille du fichier trop importante (${(fileBuffer.length / 1024 / 1024).toFixed(1)} Mo). Maximum: 10 Mo`,
    );
  }

  // Ensure directory exists
  const dir = getEntityDir(entityType, entityId);
  await fs.mkdir(dir, { recursive: true });

  // Generate unique filename to avoid collisions
  const id = randomUUID();
  const sanitized = sanitizeFilename(originalName);
  const filename = `${id.substring(0, 8)}_${sanitized}`;
  const filepath = path.join(dir, filename);

  // Write file to disk
  await fs.writeFile(filepath, fileBuffer);

  const meta: DocumentMeta = {
    id,
    filename,
    originalName,
    url: getDocumentUrl(entityType, entityId, filename),
    mimeType,
    size: fileBuffer.length,
    entityType,
    entityId,
    createdAt: new Date().toISOString(),
  };

  return meta;
}

export async function listByEntity(entityType: EntityType, entityId: string): Promise<DocumentMeta[]> {
  const dir = getEntityDir(entityType, entityId);

  try {
    const files = await fs.readdir(dir);

    const documents: DocumentMeta[] = [];

    for (const filename of files) {
      const filepath = path.join(dir, filename);
      const stat = await fs.stat(filepath);

      if (!stat.isFile()) continue;

      // Extract original name from sanitized filename (skip the uuid prefix)
      const originalName = filename.includes('_')
        ? filename.substring(filename.indexOf('_') + 1)
        : filename;

      // Determine mime type from extension
      const ext = path.extname(filename).toLowerCase();
      const mimeMap: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
      };

      documents.push({
        id: filename.split('_')[0] || filename,
        filename,
        originalName,
        url: getDocumentUrl(entityType, entityId, filename),
        mimeType: mimeMap[ext] || 'application/octet-stream',
        size: stat.size,
        entityType,
        entityId,
        createdAt: stat.birthtime.toISOString(),
      });
    }

    // Sort by creation date descending (most recent first)
    documents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return documents;
  } catch (err: any) {
    // If directory doesn't exist, return empty array
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function remove(entityType: EntityType, entityId: string, documentId: string): Promise<void> {
  const dir = getEntityDir(entityType, entityId);

  try {
    const files = await fs.readdir(dir);
    const target = files.find((f) => f.startsWith(documentId));

    if (!target) {
      throw new NotFoundError('Document', documentId);
    }

    await fs.unlink(path.join(dir, target));
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      throw new NotFoundError('Document', documentId);
    }
    throw err;
  }
}
