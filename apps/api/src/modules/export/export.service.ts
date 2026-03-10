import prisma from '../../lib/db.js';

// ─── CSV HELPERS ─────────────────────────────────────

/**
 * Escape a value for CSV: wrap in quotes if it contains commas,
 * quotes, or newlines. Internal double-quotes are doubled.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a CSV string from an array of header names and an array of row arrays.
 * Adds a BOM for Excel compatibility with UTF-8.
 */
function buildCSV(headers: string[], rows: string[][]): string {
  const bom = '\uFEFF';
  const headerLine = headers.map(csvEscape).join(',');
  const dataLines = rows.map((row) => row.map(csvEscape).join(','));
  return bom + [headerLine, ...dataLines].join('\r\n');
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toISOString().split('T')[0];
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('fr-FR');
}

// ─── EXPORT CANDIDATS ─────────────────────────────────

export async function exportCandidatsCSV(ids?: string[]): Promise<string> {
  const where = ids?.length ? { id: { in: ids } } : {};

  const candidats = await prisma.candidat.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  const headers = [
    'Nom',
    'Prénom',
    'Email',
    'Téléphone',
    'Poste',
    'Entreprise',
    'Localisation',
    'Source',
    'Salaire actuel',
    'Salaire souhaité',
    'Disponibilité',
    'Tags',
    'Date création',
  ];

  const rows = candidats.map((c) => [
    c.nom,
    c.prenom ?? '',
    c.email ?? '',
    c.telephone ?? '',
    c.posteActuel ?? '',
    c.entrepriseActuelle ?? '',
    c.localisation ?? '',
    c.source ?? '',
    formatMoney(c.salaireActuel),
    formatMoney(c.salaireSouhaite),
    c.disponibilite ?? '',
    (c.tags ?? []).join('; '),
    formatDate(c.createdAt),
  ]);

  return buildCSV(headers, rows);
}

// ─── EXPORT CLIENTS ───────────────────────────────────

export async function exportClientsCSV(ids?: string[]): Promise<string> {
  const where = ids?.length ? { id: { in: ids } } : {};

  const clients = await prisma.client.findMany({
    where,
    include: { entreprise: { select: { nom: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const headers = [
    'Nom',
    'Prénom',
    'Email',
    'Téléphone',
    'Poste',
    'Rôle',
    'Entreprise',
    'Statut',
    'Date création',
  ];

  const rows = clients.map((c) => [
    c.nom,
    c.prenom ?? '',
    c.email ?? '',
    c.telephone ?? '',
    c.poste ?? '',
    c.roleContact ?? '',
    c.entreprise.nom,
    c.statutClient,
    formatDate(c.createdAt),
  ]);

  return buildCSV(headers, rows);
}

// ─── EXPORT ENTREPRISES ───────────────────────────────

export async function exportEntreprisesCSV(ids?: string[]): Promise<string> {
  const where = ids?.length ? { id: { in: ids } } : {};

  const entreprises = await prisma.entreprise.findMany({
    where,
    include: {
      _count: { select: { clients: true, mandats: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const headers = [
    'Nom',
    'Secteur',
    'Site web',
    'Localisation',
    'Taille',
    'Nb clients',
    'Nb mandats',
  ];

  const rows = entreprises.map((e) => [
    e.nom,
    e.secteur ?? '',
    e.siteWeb ?? '',
    e.localisation ?? '',
    e.taille ?? '',
    String(e._count.clients),
    String(e._count.mandats),
  ]);

  return buildCSV(headers, rows);
}

// ─── EXPORT MANDATS ───────────────────────────────────

export async function exportMandatsCSV(ids?: string[]): Promise<string> {
  const where = ids?.length ? { id: { in: ids } } : {};

  const mandats = await prisma.mandat.findMany({
    where,
    include: {
      entreprise: { select: { nom: true } },
      client: { select: { nom: true, prenom: true } },
      _count: { select: { candidatures: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const headers = [
    'Titre',
    'Entreprise',
    'Client',
    'Statut',
    'Priorité',
    'Salaire min',
    'Salaire max',
    'Fee estimé',
    'Nb candidats',
    'Date création',
  ];

  const rows = mandats.map((m) => [
    m.titrePoste,
    m.entreprise.nom,
    [m.client.prenom, m.client.nom].filter(Boolean).join(' '),
    m.statut,
    m.priorite,
    formatMoney(m.salaireMin),
    formatMoney(m.salaireMax),
    formatMoney(m.feeMontantEstime),
    String(m._count.candidatures),
    formatDate(m.createdAt),
  ]);

  return buildCSV(headers, rows);
}
