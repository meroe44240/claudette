import prisma from '../../lib/db.js';

interface SearchResult {
  id: string;
  type: 'candidat' | 'client' | 'entreprise' | 'mandat';
  title: string;
  subtitle: string | null;
  score: number;
}

function scoreResult(title: string, subtitle: string | null, query: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerSubtitle = (subtitle || '').toLowerCase();

  // Exact match on title gets highest score
  if (lowerTitle === lowerQuery) return 100;
  // Title starts with query
  if (lowerTitle.startsWith(lowerQuery)) return 80;
  // Title contains query
  if (lowerTitle.includes(lowerQuery)) return 60;
  // Subtitle exact match
  if (lowerSubtitle === lowerQuery) return 50;
  // Subtitle starts with query
  if (lowerSubtitle.startsWith(lowerQuery)) return 40;
  // Subtitle contains query
  if (lowerSubtitle.includes(lowerQuery)) return 30;
  // Partial match (fallback)
  return 10;
}

export async function globalSearch(query: string): Promise<{ data: SearchResult[] }> {
  if (!query || query.length < 2) return { data: [] };

  const [candidats, clients, entreprises, mandats] = await Promise.all([
    prisma.candidat.findMany({
      where: {
        OR: [
          { nom: { contains: query, mode: 'insensitive' } },
          { prenom: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { telephone: { contains: query, mode: 'insensitive' } },
          { posteActuel: { contains: query, mode: 'insensitive' } },
          { entrepriseActuelle: { contains: query, mode: 'insensitive' } },
          { tags: { has: query } },
          { experiences: { some: { titre: { contains: query, mode: 'insensitive' } } } },
          { experiences: { some: { entreprise: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      take: 15,
      select: { id: true, nom: true, prenom: true, posteActuel: true, entrepriseActuelle: true },
    }),
    prisma.client.findMany({
      where: {
        OR: [
          { nom: { contains: query, mode: 'insensitive' } },
          { prenom: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
          { telephone: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 15,
      include: { entreprise: { select: { nom: true } } },
    }),
    prisma.entreprise.findMany({
      where: {
        OR: [
          { nom: { contains: query, mode: 'insensitive' } },
          { secteur: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 15,
      select: { id: true, nom: true, secteur: true },
    }),
    prisma.mandat.findMany({
      where: {
        OR: [
          { titrePoste: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 15,
      include: { entreprise: { select: { nom: true } } },
    }),
  ]);

  const data: SearchResult[] = [
    ...candidats.map((c) => {
      const title = `${c.prenom || ''} ${c.nom}`.trim();
      const subtitle = [c.posteActuel, c.entrepriseActuelle].filter(Boolean).join(' \u2014 ') || null;
      return {
        id: c.id,
        type: 'candidat' as const,
        title,
        subtitle,
        score: scoreResult(title, subtitle, query),
      };
    }),
    ...clients.map((c) => {
      const title = `${c.prenom || ''} ${c.nom}`.trim();
      const subtitle = c.entreprise?.nom || null;
      return {
        id: c.id,
        type: 'client' as const,
        title,
        subtitle,
        score: scoreResult(title, subtitle, query),
      };
    }),
    ...entreprises.map((e) => {
      const title = e.nom;
      const subtitle = e.secteur || null;
      return {
        id: e.id,
        type: 'entreprise' as const,
        title,
        subtitle,
        score: scoreResult(title, subtitle, query),
      };
    }),
    ...mandats.map((m) => {
      const title = m.titrePoste;
      const subtitle = m.entreprise?.nom || null;
      return {
        id: m.id,
        type: 'mandat' as const,
        title,
        subtitle,
        score: scoreResult(title, subtitle, query),
      };
    }),
  ];

  // Sort by relevance score (highest first)
  data.sort((a, b) => b.score - a.score);

  return { data };
}
