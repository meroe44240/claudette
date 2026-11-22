import prisma from '../../../lib/db.js';
import { getEntity } from './registry.js';
import { buildWhere, delegateOf } from './engine.js';

/** Recherche globale, comme la barre de recherche de l'interface : un mot, tous les types. */
const TYPES: Record<string, { label: (r: any) => string; sub: (r: any) => string | null; select: Record<string, true> }> = {
  candidate: {
    select: { id: true, prenom: true, nom: true, posteActuel: true, entrepriseActuelle: true, email: true },
    label: (r) => [r.prenom, r.nom].filter(Boolean).join(' '),
    sub: (r) => [r.posteActuel, r.entrepriseActuelle].filter(Boolean).join(' · ') || r.email,
  },
  company: { select: { id: true, nom: true, secteur: true, localisation: true }, label: (r) => r.nom, sub: (r) => [r.secteur, r.localisation].filter(Boolean).join(' · ') || null },
  client: {
    select: { id: true, prenom: true, nom: true, poste: true, email: true, entrepriseId: true },
    label: (r) => [r.prenom, r.nom].filter(Boolean).join(' '), sub: (r) => r.poste ?? r.email,
  },
  mandate: { select: { id: true, titrePoste: true, statut: true, localisation: true }, label: (r) => r.titrePoste, sub: (r) => [r.statut, r.localisation].filter(Boolean).join(' · ') },
  lead: { select: { id: true, company: true, contact: true, stage: true }, label: (r) => `${r.company} (${r.contact})`, sub: (r) => r.stage },
  job_offer: { select: { id: true, titre: true, published: true, localisation: true }, label: (r) => r.titre, sub: (r) => (r.published ? 'published' : 'draft') },
};

export const SEARCH_TYPES = Object.keys(TYPES);

export async function searchAll(q: string, types?: string[], limit = 5) {
  const wanted = (types?.length ? types : SEARCH_TYPES).map((t) => getEntity(t).name).filter((t) => TYPES[t]);
  const take = Math.min(Math.max(limit, 1), 25);
  const out: Record<string, { total: number; results: Array<{ id: string; label: string; detail: string | null }> }> = {};
  await Promise.all(wanted.map(async (t) => {
    const def = getEntity(t);
    const where = buildWhere(def, undefined, q);
    const d = delegateOf(prisma, def.model);
    const [rows, total] = await Promise.all([
      d.findMany({ where, take, select: TYPES[t].select, orderBy: { updatedAt: 'desc' } }),
      d.count({ where }),
    ]);
    out[t] = { total, results: rows.map((r: any) => ({ id: r.id, label: TYPES[t].label(r), detail: TYPES[t].sub(r) })) };
  }));
  return { q, results: out };
}
