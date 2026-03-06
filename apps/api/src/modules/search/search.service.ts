import prisma from '../../lib/db.js';

interface SearchResult {
  id: string;
  type: 'candidat' | 'client' | 'entreprise' | 'mandat';
  title: string;
  subtitle: string | null;
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
          { posteActuel: { contains: query, mode: 'insensitive' } },
          { entrepriseActuelle: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, nom: true, prenom: true, posteActuel: true, entrepriseActuelle: true },
    }),
    prisma.client.findMany({
      where: {
        OR: [
          { nom: { contains: query, mode: 'insensitive' } },
          { prenom: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
      include: { entreprise: { select: { nom: true } } },
    }),
    prisma.entreprise.findMany({
      where: {
        OR: [
          { nom: { contains: query, mode: 'insensitive' } },
          { secteur: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
      select: { id: true, nom: true, secteur: true },
    }),
    prisma.mandat.findMany({
      where: {
        OR: [
          { titrePoste: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
      include: { entreprise: { select: { nom: true } } },
    }),
  ]);

  const data: SearchResult[] = [
    ...candidats.map((c) => ({
      id: c.id,
      type: 'candidat' as const,
      title: `${c.prenom || ''} ${c.nom}`.trim(),
      subtitle: [c.posteActuel, c.entrepriseActuelle].filter(Boolean).join(' \u2014 ') || null,
    })),
    ...clients.map((c) => ({
      id: c.id,
      type: 'client' as const,
      title: `${c.prenom || ''} ${c.nom}`.trim(),
      subtitle: c.entreprise?.nom || null,
    })),
    ...entreprises.map((e) => ({
      id: e.id,
      type: 'entreprise' as const,
      title: e.nom,
      subtitle: e.secteur || null,
    })),
    ...mandats.map((m) => ({
      id: m.id,
      type: 'mandat' as const,
      title: m.titrePoste,
      subtitle: m.entreprise?.nom || null,
    })),
  ];

  return { data };
}
