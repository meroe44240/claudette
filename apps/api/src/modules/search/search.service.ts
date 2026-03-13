import prisma from '../../lib/db.js';

interface SearchResult {
  id: string;
  type: 'candidat' | 'client' | 'entreprise' | 'mandat';
  title: string;
  subtitle: string | null;
  extra?: string | null;
  score: number;
}

const STAGE_LABELS: Record<string, string> = {
  SOURCING: 'Sourcing',
  CONTACTE: 'Contacté',
  ENTRETIEN_1: 'Entretien 1',
  ENTRETIEN_CLIENT: 'Entretien Client',
  OFFRE: 'Offre',
  PLACE: 'Placé',
  REFUSE: 'Refusé',
};

const STATUT_LABELS: Record<string, string> = {
  OUVERT: 'Ouvert',
  EN_COURS: 'En cours',
  GAGNE: 'Gagné',
  PERDU: 'Perdu',
  ANNULE: 'Annulé',
  CLOTURE: 'Clôturé',
};

function scoreResult(title: string, subtitle: string | null, query: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerSubtitle = (subtitle || '').toLowerCase();

  if (lowerTitle === lowerQuery) return 100;
  if (lowerTitle.startsWith(lowerQuery)) return 80;
  if (lowerTitle.includes(lowerQuery)) return 60;
  if (lowerSubtitle === lowerQuery) return 50;
  if (lowerSubtitle.startsWith(lowerQuery)) return 40;
  if (lowerSubtitle.includes(lowerQuery)) return 30;
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
      select: {
        id: true,
        nom: true,
        prenom: true,
        posteActuel: true,
        entrepriseActuelle: true,
        localisation: true,
        telephone: true,
        candidatures: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { stage: true },
        },
      },
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
      include: {
        entreprise: { select: { nom: true } },
        _count: { select: { mandats: true } },
      },
    }),
    prisma.entreprise.findMany({
      where: {
        OR: [
          { nom: { contains: query, mode: 'insensitive' } },
          { secteur: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 15,
      select: {
        id: true,
        nom: true,
        secteur: true,
        localisation: true,
        _count: { select: { mandats: true, clients: true } },
      },
    }),
    prisma.mandat.findMany({
      where: {
        OR: [
          { titrePoste: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 15,
      include: {
        entreprise: { select: { nom: true } },
        _count: { select: { candidatures: true } },
      },
    }),
  ]);

  const data: SearchResult[] = [
    ...candidats.map((c) => {
      const title = `${c.prenom || ''} ${c.nom}`.trim();
      const subtitle = [c.posteActuel, c.entrepriseActuelle].filter(Boolean).join(' — ') || null;
      const extraParts: string[] = [];
      if (c.localisation) extraParts.push(c.localisation);
      const lastStage = c.candidatures[0]?.stage;
      if (lastStage) extraParts.push(STAGE_LABELS[lastStage] || lastStage);
      return {
        id: c.id,
        type: 'candidat' as const,
        title,
        subtitle,
        extra: extraParts.length > 0 ? extraParts.join(' · ') : null,
        score: scoreResult(title, subtitle, query),
      };
    }),
    ...clients.map((c) => {
      const title = `${c.prenom || ''} ${c.nom}`.trim();
      const subtitle = c.entreprise?.nom || null;
      const mandatsCount = (c._count as any)?.mandats ?? 0;
      const extra = mandatsCount > 0 ? `${mandatsCount} mandat${mandatsCount > 1 ? 's' : ''}` : null;
      return {
        id: c.id,
        type: 'client' as const,
        title,
        subtitle,
        extra,
        score: scoreResult(title, subtitle, query),
      };
    }),
    ...entreprises.map((e) => {
      const title = e.nom;
      const subtitle = e.secteur || null;
      const extraParts: string[] = [];
      if (e.localisation) extraParts.push(e.localisation);
      const mandatsCount = e._count?.mandats ?? 0;
      const clientsCount = e._count?.clients ?? 0;
      if (mandatsCount > 0) extraParts.push(`${mandatsCount} mandat${mandatsCount > 1 ? 's' : ''}`);
      if (clientsCount > 0) extraParts.push(`${clientsCount} contact${clientsCount > 1 ? 's' : ''}`);
      return {
        id: e.id,
        type: 'entreprise' as const,
        title,
        subtitle,
        extra: extraParts.length > 0 ? extraParts.join(' · ') : null,
        score: scoreResult(title, subtitle, query),
      };
    }),
    ...mandats.map((m) => {
      const title = m.titrePoste;
      const subtitle = m.entreprise?.nom || null;
      const extraParts: string[] = [];
      if (m.statut) extraParts.push(STATUT_LABELS[m.statut] || m.statut);
      const candidatsCount = (m._count as any)?.candidatures ?? 0;
      if (candidatsCount > 0) extraParts.push(`${candidatsCount} candidat${candidatsCount > 1 ? 's' : ''}`);
      return {
        id: m.id,
        type: 'mandat' as const,
        title,
        subtitle,
        extra: extraParts.length > 0 ? extraParts.join(' · ') : null,
        score: scoreResult(title, subtitle, query),
      };
    }),
  ];

  data.sort((a, b) => b.score - a.score);

  return { data };
}
