import prisma from '../../lib/db.js';
import { ValidationError, AppError } from '../../lib/errors.js';
import type { Prisma } from '@prisma/client';

// ─── TYPES ──────────────────────────────────────────

interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

interface ColumnMapping {
  mapping: Record<string, string>;
  unmapped: string[];
}

interface PreviewResult {
  preview: Record<string, unknown>[];
  duplicates: { row: number; matchedId: string; matchedField: string }[];
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

interface BulkCVResult {
  filename: string;
  text: string;
}

// ─── COLUMN MAPPING DICTIONARIES ────────────────────

const MAPPING_DICTIONARIES: Record<string, Record<string, string>> = {
  candidat: {
    nom: 'nom',
    'last name': 'nom',             // LinkedIn CSV
    'nom de famille': 'nom',
    prenom: 'prenom',
    'first name': 'prenom',         // LinkedIn CSV
    email: 'email',
    'email address': 'email',       // LinkedIn CSV
    telephone: 'telephone',
    tel: 'telephone',
    phone: 'telephone',
    poste: 'posteActuel',
    'poste actuel': 'posteActuel',
    position: 'posteActuel',        // LinkedIn CSV
    title: 'posteActuel',
    entreprise: 'entrepriseActuelle',
    company: 'entrepriseActuelle',  // LinkedIn CSV
    localisation: 'localisation',
    ville: 'localisation',
    location: 'localisation',       // LinkedIn CSV
    salaire: 'salaireActuel',
    linkedin: 'linkedinUrl',
    url: 'linkedinUrl',             // LinkedIn CSV
    'linkedin url': 'linkedinUrl',
    'profile url': 'linkedinUrl',
    source: 'source',
    tags: 'tags',
    notes: 'notes',
  },
  client: {
    nom: 'nom',
    prenom: 'prenom',
    email: 'email',
    telephone: 'telephone',
    poste: 'poste',
    role: 'roleContact',
    entreprise_id: 'entrepriseId',
    notes: 'notes',
    linkedin: 'linkedinUrl',
  },
  entreprise: {
    nom: 'nom',
    secteur: 'secteur',
    site_web: 'siteWeb',
    'site web': 'siteWeb',
    taille: 'taille',
    localisation: 'localisation',
    linkedin: 'linkedinUrl',
    notes: 'notes',
  },
  mandat: {
    titre: 'titrePoste',
    poste: 'titrePoste',
    entreprise_id: 'entrepriseId',
    client_id: 'clientId',
    description: 'description',
    localisation: 'localisation',
    salaire_min: 'salaireMin',
    salaire_max: 'salaireMax',
  },
};

const VALID_ENTITY_TYPES = ['candidat', 'client', 'entreprise', 'mandat'] as const;
type EntityType = (typeof VALID_ENTITY_TYPES)[number];

// ─── CSV PARSING ────────────────────────────────────

function detectDelimiter(firstLine: string): string {
  const delimiters = [',', ';', '\t'];
  let bestDelimiter = ',';
  let maxCount = 0;

  for (const delim of delimiters) {
    const count = firstLine.split(delim).length - 1;
    if (count > maxCount) {
      maxCount = count;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i]!;

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      current += char;
      i++;
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (char === delimiter) {
        fields.push(current.trim());
        current = '';
        i++;
        continue;
      }
      current += char;
      i++;
    }
  }

  // Push last field
  fields.push(current.trim());

  return fields;
}

export function parseCSV(buffer: Buffer, delimiter?: string): ParsedCSV {
  const content = buffer.toString('utf-8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new ValidationError('Le fichier CSV est vide');
  }

  const effectiveDelimiter = delimiter ?? detectDelimiter(lines[0]!);

  const headers = parseCSVLine(lines[0]!, effectiveDelimiter);

  if (headers.length === 0 || headers.every((h) => h === '')) {
    throw new ValidationError('Aucune colonne detectee dans le fichier CSV');
  }

  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVLine(lines[i]!, effectiveDelimiter);
    // Pad or trim row to match header length
    while (row.length < headers.length) {
      row.push('');
    }
    if (row.length > headers.length) {
      row.length = headers.length;
    }
    rows.push(row);
  }

  return { headers, rows };
}

// ─── COLUMN AUTO-MAPPING ────────────────────────────

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[_-]/g, ' ') // Normalize separators
    .trim();
}

export function autoMapColumns(headers: string[], entityType: string): ColumnMapping {
  if (!VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
    throw new ValidationError(`Type d'entite invalide: ${entityType}. Types valides: ${VALID_ENTITY_TYPES.join(', ')}`);
  }

  const dictionary = MAPPING_DICTIONARIES[entityType]!;
  const mapping: Record<string, string> = {};
  const unmapped: string[] = [];

  for (const header of headers) {
    const normalizedHeader = normalizeHeader(header);
    const matchedField = dictionary[normalizedHeader];

    if (matchedField) {
      mapping[header] = matchedField;
    } else {
      // Try partial matching — check if any dictionary key is contained in the header
      let found = false;
      for (const [key, value] of Object.entries(dictionary)) {
        const normalizedKey = normalizeHeader(key);
        if (normalizedHeader.includes(normalizedKey) || normalizedKey.includes(normalizedHeader)) {
          mapping[header] = value;
          found = true;
          break;
        }
      }
      if (!found) {
        unmapped.push(header);
      }
    }
  }

  return { mapping, unmapped };
}

// ─── PREVIEW ────────────────────────────────────────

export async function preview(
  rows: string[][],
  mapping: Record<string, string>,
  entityType: string,
): Promise<PreviewResult> {
  if (!VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
    throw new ValidationError(`Type d'entite invalide: ${entityType}`);
  }

  // Get headers from mapping keys (ordered)
  const headers = Object.keys(mapping);

  // Build preview rows (first 10)
  const previewRows: Record<string, unknown>[] = [];
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i]!;
    const record: Record<string, unknown> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j]!;
      const field = mapping[header];
      if (field) {
        const value = j < row.length ? row[j]! : '';
        // Convert numeric fields
        if (['salaireActuel', 'salaireSouhaite', 'salaireMin', 'salaireMax'].includes(field)) {
          const num = parseInt(value, 10);
          record[field] = isNaN(num) ? null : num;
        } else if (field === 'tags' && typeof value === 'string') {
          record[field] = value
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
        } else {
          record[field] = value;
        }
      }
    }

    previewRows.push(record);
  }

  // Duplicate detection
  const duplicates: { row: number; matchedId: string; matchedField: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const record: Record<string, string> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j]!;
      const field = mapping[header];
      if (field && j < row.length) {
        record[field] = row[j]!;
      }
    }

    if (entityType === 'candidat') {
      // Check by email first, then by LinkedIn URL
      if (record.email && record.email.trim() !== '') {
        const existing = await prisma.candidat.findFirst({
          where: { email: { equals: record.email.trim(), mode: 'insensitive' } },
          select: { id: true },
        });
        if (existing) {
          duplicates.push({ row: i, matchedId: existing.id, matchedField: 'email' });
          continue;
        }
      }
      if (record.linkedinUrl && record.linkedinUrl.trim() !== '') {
        const normalizedUrl = record.linkedinUrl.trim().replace(/\/+$/, '').split('?')[0]!;
        const existing = await prisma.candidat.findFirst({
          where: { linkedinUrl: { contains: normalizedUrl, mode: 'insensitive' } },
          select: { id: true },
        });
        if (existing) {
          duplicates.push({ row: i, matchedId: existing.id, matchedField: 'linkedinUrl' });
          continue;
        }
      }
    } else if (entityType === 'client' && record.email && record.email.trim() !== '') {
      const existing = await prisma.client.findFirst({
        where: { email: { equals: record.email.trim(), mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing) {
        duplicates.push({ row: i, matchedId: existing.id, matchedField: 'email' });
      }
    } else if (entityType === 'entreprise' && record.nom && record.nom.trim() !== '') {
      const existing = await prisma.entreprise.findFirst({
        where: { nom: { equals: record.nom.trim(), mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing) {
        duplicates.push({ row: i, matchedId: existing.id, matchedField: 'nom' });
      }
    }
  }

  return { preview: previewRows, duplicates };
}

// ─── EXECUTE IMPORT ─────────────────────────────────

function buildRowRecord(
  row: string[],
  headers: string[],
  mapping: Record<string, string>,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  for (let j = 0; j < headers.length; j++) {
    const header = headers[j]!;
    const field = mapping[header];
    if (field && j < row.length) {
      const value = row[j]!;
      if (['salaireActuel', 'salaireSouhaite', 'salaireMin', 'salaireMax'].includes(field)) {
        const num = parseInt(value, 10);
        record[field] = isNaN(num) ? undefined : num;
      } else if (field === 'tags' && typeof value === 'string') {
        record[field] = value
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
      } else if (value.trim() !== '') {
        record[field] = value.trim();
      }
    }
  }

  return record;
}

async function isDuplicate(record: Record<string, unknown>, entityType: string): Promise<string | null> {
  if (entityType === 'candidat') {
    // Check by email
    if (record.email && typeof record.email === 'string' && record.email.trim() !== '') {
      const existing = await prisma.candidat.findFirst({
        where: { email: { equals: record.email.trim(), mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    // Check by LinkedIn URL
    if (record.linkedinUrl && typeof record.linkedinUrl === 'string' && record.linkedinUrl.trim() !== '') {
      const normalizedUrl = record.linkedinUrl.trim().replace(/\/+$/, '').split('?')[0]!;
      const existing = await prisma.candidat.findFirst({
        where: { linkedinUrl: { contains: normalizedUrl, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing) return existing.id;
    }
    return null;
  }

  if (entityType === 'client' && record.email && typeof record.email === 'string' && record.email.trim() !== '') {
    const existing = await prisma.client.findFirst({
      where: { email: { equals: record.email.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    return existing ? existing.id : null;
  }

  if (entityType === 'entreprise' && record.nom && typeof record.nom === 'string' && record.nom.trim() !== '') {
    const existing = await prisma.entreprise.findFirst({
      where: { nom: { equals: record.nom.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    return existing ? existing.id : null;
  }

  return null;
}

export async function executeImport(
  rows: string[][],
  mapping: Record<string, string>,
  entityType: string,
  userId: string,
  skipDuplicates: boolean,
): Promise<ImportResult> {
  if (!VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
    throw new ValidationError(`Type d'entite invalide: ${entityType}`);
  }

  const headers = Object.keys(mapping);
  let imported = 0;
  let skipped = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i]!;
      const record = buildRowRecord(row, headers, mapping);

      // Check duplicates
      if (skipDuplicates) {
        const dupId = await isDuplicate(record, entityType);
        if (dupId) {
          skipped++;
          continue;
        }
      }

      // Validate required fields
      if (entityType === 'candidat') {
        if (!record.nom || (typeof record.nom === 'string' && record.nom.trim() === '')) {
          errors.push({ row: i, error: 'Champ "nom" requis pour un candidat' });
          continue;
        }
        await prisma.candidat.create({
          data: {
            nom: record.nom as string,
            prenom: record.prenom as string | undefined,
            email: record.email as string | undefined,
            telephone: record.telephone as string | undefined,
            posteActuel: record.posteActuel as string | undefined,
            entrepriseActuelle: record.entrepriseActuelle as string | undefined,
            localisation: record.localisation as string | undefined,
            salaireActuel: record.salaireActuel as number | undefined,
            linkedinUrl: record.linkedinUrl as string | undefined,
            source: record.source as string | undefined,
            tags: (record.tags as string[]) ?? [],
            notes: record.notes as string | undefined,
            createdById: userId,
          },
        });
        imported++;
      } else if (entityType === 'client') {
        if (!record.nom || (typeof record.nom === 'string' && record.nom.trim() === '')) {
          errors.push({ row: i, error: 'Champ "nom" requis pour un client' });
          continue;
        }
        if (!record.entrepriseId || (typeof record.entrepriseId === 'string' && record.entrepriseId.trim() === '')) {
          errors.push({ row: i, error: 'Champ "entrepriseId" requis pour un client' });
          continue;
        }
        await prisma.client.create({
          data: {
            nom: record.nom as string,
            prenom: record.prenom as string | undefined,
            email: record.email as string | undefined,
            telephone: record.telephone as string | undefined,
            poste: record.poste as string | undefined,
            roleContact: record.roleContact as any,
            linkedinUrl: record.linkedinUrl as string | undefined,
            entrepriseId: record.entrepriseId as string,
            notes: record.notes as string | undefined,
            createdById: userId,
          },
        });
        imported++;
      } else if (entityType === 'entreprise') {
        if (!record.nom || (typeof record.nom === 'string' && record.nom.trim() === '')) {
          errors.push({ row: i, error: 'Champ "nom" requis pour une entreprise' });
          continue;
        }
        await prisma.entreprise.create({
          data: {
            nom: record.nom as string,
            secteur: record.secteur as string | undefined,
            siteWeb: record.siteWeb as string | undefined,
            taille: record.taille as any,
            localisation: record.localisation as string | undefined,
            linkedinUrl: record.linkedinUrl as string | undefined,
            notes: record.notes as string | undefined,
            createdById: userId,
          },
        });
        imported++;
      } else if (entityType === 'mandat') {
        if (!record.titrePoste || (typeof record.titrePoste === 'string' && record.titrePoste.trim() === '')) {
          errors.push({ row: i, error: 'Champ "titrePoste" requis pour un mandat' });
          continue;
        }
        if (!record.entrepriseId || (typeof record.entrepriseId === 'string' && record.entrepriseId.trim() === '')) {
          errors.push({ row: i, error: 'Champ "entrepriseId" requis pour un mandat' });
          continue;
        }
        if (!record.clientId || (typeof record.clientId === 'string' && record.clientId.trim() === '')) {
          errors.push({ row: i, error: 'Champ "clientId" requis pour un mandat' });
          continue;
        }
        await prisma.mandat.create({
          data: {
            titrePoste: record.titrePoste as string,
            entrepriseId: record.entrepriseId as string,
            clientId: record.clientId as string,
            description: record.description as string | undefined,
            localisation: record.localisation as string | undefined,
            salaireMin: record.salaireMin as number | undefined,
            salaireMax: record.salaireMax as number | undefined,
            createdById: userId,
          },
        });
        imported++;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      errors.push({ row: i, error: message });
    }
  }

  return { imported, skipped, errors };
}

// ─── BULK CV PARSING (PLACEHOLDER) ──────────────────

export function parseBulkCVs(files: { filename: string; buffer: Buffer }[]): BulkCVResult[] {
  // Placeholder for PDF text extraction
  // In production, this would use pdf-parse or similar library
  console.log(`[Import] Would parse ${files.length} CV file(s) using pdf-parse`);

  return files.map((file) => {
    console.log(`[Import] Would extract text from PDF: ${file.filename} (${file.buffer.length} bytes)`);

    return {
      filename: file.filename,
      text: `[Placeholder] Extracted text from ${file.filename} — pdf-parse not yet installed. ` +
        `File size: ${file.buffer.length} bytes. ` +
        'Install pdf-parse to enable real PDF text extraction.',
    };
  });
}
