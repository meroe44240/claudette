/**
 * Bulk import LinkedIn connections from CSV into the candidats table.
 *
 * Usage:  npx tsx scripts/import-linkedin.ts <path-to-csv>
 *
 * - Deduplicates by normalized linkedinUrl
 * - Skips rows already present in DB
 * - Processes in batches of 500 for performance
 */

import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── helpers ──────────────────────────────────────────

function normalizeLinkedinUrl(url: string): string {
  return url.replace(/\/+$/, '').split('?')[0].split('#')[0];
}

interface CsvRow {
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  current_company: string;
  current_role: string;
  source: string;
  status: string;
  connected_on: string;
  tags: string;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  // Skip header
  const header = lines[0];
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 6) continue; // skip malformed

    rows.push({
      first_name: fields[0] || '',
      last_name: fields[1] || '',
      email: fields[2] || '',
      linkedin_url: fields[3] || '',
      current_company: fields[4] || '',
      current_role: fields[5] || '',
      source: fields[6] || 'linkedin_import',
      status: fields[7] || 'new',
      connected_on: fields[8] || '',
      tags: fields[9] || '',
    });
  }

  return rows;
}

// ── main ─────────────────────────────────────────────

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-linkedin.ts <path-to-csv>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(csvPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`📂 Reading CSV: ${resolvedPath}`);
  const rows = parseCsv(resolvedPath);
  console.log(`📊 Parsed ${rows.length} rows from CSV`);

  // Deduplicate within CSV by linkedin URL
  const seen = new Map<string, CsvRow>();
  for (const row of rows) {
    if (!row.linkedin_url && !row.email) continue; // skip rows with no identifier
    const key = row.linkedin_url
      ? normalizeLinkedinUrl(row.linkedin_url)
      : row.email.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, row);
    }
  }
  console.log(`🔍 ${seen.size} unique contacts after CSV dedup`);

  // Get existing LinkedIn URLs from DB
  console.log('🗃️  Fetching existing LinkedIn URLs from DB...');
  const existing = await prisma.candidat.findMany({
    where: { linkedinUrl: { not: null } },
    select: { linkedinUrl: true },
  });
  const existingUrls = new Set(
    existing
      .map((c) => c.linkedinUrl)
      .filter(Boolean)
      .map((url) => normalizeLinkedinUrl(url!)),
  );
  console.log(`   ${existingUrls.size} existing candidats with LinkedIn URLs`);

  // Also check existing emails
  const existingEmails = await prisma.candidat.findMany({
    where: { email: { not: null } },
    select: { email: true },
  });
  const existingEmailSet = new Set(
    existingEmails
      .map((c) => c.email?.toLowerCase())
      .filter(Boolean),
  );

  // Filter out already-existing contacts
  const toInsert: CsvRow[] = [];
  let skippedUrl = 0;
  let skippedEmail = 0;

  for (const [key, row] of seen) {
    if (row.linkedin_url && existingUrls.has(normalizeLinkedinUrl(row.linkedin_url))) {
      skippedUrl++;
      continue;
    }
    if (!row.linkedin_url && row.email && existingEmailSet.has(row.email.toLowerCase())) {
      skippedEmail++;
      continue;
    }
    toInsert.push(row);
  }

  console.log(`⏭️  Skipped: ${skippedUrl} (LinkedIn URL exists) + ${skippedEmail} (email exists)`);
  console.log(`✅ ${toInsert.length} contacts to import`);

  if (toInsert.length === 0) {
    console.log('Nothing to import. Done!');
    return;
  }

  // Get first user as default createdById
  const firstUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!firstUser) {
    console.error('No user found in DB. Create a user first.');
    process.exit(1);
  }
  console.log(`👤 Using user: ${firstUser.prenom ?? ''} ${firstUser.nom} (${firstUser.id})`);

  // Batch insert
  const BATCH_SIZE = 500;
  let created = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);

    const data = batch.map((row) => ({
      nom: row.last_name,
      prenom: row.first_name || null,
      email: row.email || null,
      linkedinUrl: row.linkedin_url ? normalizeLinkedinUrl(row.linkedin_url) : null,
      entrepriseActuelle: row.current_company || null,
      posteActuel: row.current_role || null,
      source: 'linkedin_import',
      tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : ['linkedin-connection'],
      createdById: firstUser.id,
    }));

    const result = await prisma.candidat.createMany({
      data,
      skipDuplicates: true,
    });

    created += result.count;
    console.log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}: inserted ${result.count}/${batch.length} (total: ${created})`);
  }

  console.log(`\n🎉 Import terminé ! ${created} candidats créés.`);
}

main()
  .catch((e) => {
    console.error('Import failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
