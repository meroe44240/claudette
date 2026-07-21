/**
 * List Push — reverse-sourcing par établissement.
 *
 * Workflow :
 * 1. Créer une MarketList (métier, zones, exclusions).
 * 2. Uploader des CV → parseCv (existant) extrait les experiences.
 *    Chaque `experience.company` alimente une MarketListEstablishment
 *    (incrémente `frequency`, aggrège les titles, MAJ statuts).
 * 3. Le user marque certains établissements comme EXCLUDED s'il ne veut
 *    pas les prospecter (concurrents, cible client déjà signée, etc.).
 * 4. Bouton "Générer mandats prospection" → bulk-create Entreprise +
 *    Client(statutClient=LEAD) sur les establishments != EXCLUDED et
 *    != CLIENT_EXISTING.
 */

import prisma from '../../lib/db.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { parseCv } from '../ai/cv-parsing.service.js';
import type { MarketEstablishmentStatus } from '@prisma/client';

// ─── Lists CRUD ─────────────────────────────────

export async function createList(
  data: {
    name: string;
    sectorTags?: string[];
    zones?: string[];
    excludedCompanies?: string[];
  },
  createdById: string,
) {
  if (!data.name?.trim()) throw new ValidationError('Le nom de la liste est requis');
  return prisma.marketList.create({
    data: {
      name: data.name.trim(),
      sectorTags: data.sectorTags ?? [],
      zones: data.zones ?? [],
      excludedCompanies: data.excludedCompanies ?? [],
      createdById,
    },
  });
}

export async function listLists() {
  return prisma.marketList.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      sectorTags: true,
      zones: true,
      excludedCompanies: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { establishments: true } },
    },
  });
}

export async function getList(id: string) {
  const list = await prisma.marketList.findUnique({
    where: { id },
    include: {
      establishments: {
        orderBy: [{ frequency: 'desc' }, { name: 'asc' }],
      },
    },
  });
  if (!list) throw new NotFoundError('MarketList', id);
  return list;
}

export async function updateEstablishmentStatus(
  establishmentId: string,
  status: MarketEstablishmentStatus,
) {
  return prisma.marketListEstablishment.update({
    where: { id: establishmentId },
    data: { status },
  });
}

// ─── Ingestion CV ───────────────────────────────

/**
 * Ingest un CV : parseCv → cree/upsert le Candidat + aggrège chaque
 * expérience dans MarketListEstablishment (frequency++ si existant).
 *
 * Retourne le résumé : combien d'établissements nouveaux vs incrementés.
 */
export async function ingestCvIntoList(
  listId: string,
  fileBuffer: Buffer,
  filename: string,
  userId: string,
) {
  const list = await prisma.marketList.findUnique({ where: { id: listId } });
  if (!list) throw new NotFoundError('MarketList', listId);

  const parsed = await parseCv(fileBuffer, filename, userId);
  const cand = parsed.candidate;

  // Cree le Candidat en base (avec source = list-push)
  const candidat = await prisma.candidat.create({
    data: {
      nom: cand.last_name || 'Inconnu',
      prenom: cand.first_name || null,
      email: cand.email,
      telephone: cand.phone,
      localisation: cand.city,
      posteActuel: cand.current_title,
      entrepriseActuelle: cand.current_company,
      linkedinUrl: cand.linkedin_url,
      anneesExperience: cand.years_experience || null,
      source: 'list-push',
      tags: ['list-push', list.name],
      createdById: userId,
      aiPitchShort: parsed.pitch.short,
      aiPitchLong: parsed.pitch.long,
      aiSellingPoints: parsed.pitch.key_selling_points as any,
      aiIdealFor: parsed.pitch.ideal_for,
      aiAnonymizedProfile: parsed.anonymized_profile as any,
      aiParsedAt: new Date(),
    },
  });

  // Ecrit les experiences en CandidatExperience
  for (const exp of cand.experience) {
    await prisma.candidatExperience.create({
      data: {
        candidatId: candidat.id,
        titre: exp.title,
        entreprise: exp.company,
        anneeDebut: exp.start_year,
        anneeFin: exp.end_year,
        highlights: exp.highlights ?? [],
        source: 'cv',
      },
    });
  }

  // Aggrege chaque experience dans MarketListEstablishment
  const summary = { new: 0, incremented: 0, excludedByFilter: 0 };
  for (const exp of cand.experience) {
    if (!exp.company?.trim()) continue;
    const companyNorm = exp.company.trim();

    // Skip si liste des exclusions
    if (list.excludedCompanies.some((c) => c.toLowerCase() === companyNorm.toLowerCase())) {
      summary.excludedByFilter += 1;
      continue;
    }

    // Ville : on prend celle du candidat en fallback (les CV rarement donnent la ville de chaque job)
    const cityGuess = cand.city ?? null;

    const existing = await prisma.marketListEstablishment.findUnique({
      where: { marketListId_name: { marketListId: listId, name: companyNorm } },
    });

    if (existing) {
      const newTitles = Array.from(new Set([...(existing.titles ?? []), exp.title].filter(Boolean)));
      await prisma.marketListEstablishment.update({
        where: { id: existing.id },
        data: {
          frequency: existing.frequency + 1,
          titles: newTitles,
        },
      });
      summary.incremented += 1;
    } else {
      // Cherche si l'entreprise existe déjà dans le CRM
      const inCrm = await prisma.entreprise.findFirst({
        where: { nom: { equals: companyNorm, mode: 'insensitive' } },
        select: { id: true },
      });
      // Cherche si c'est déjà un client actif (statutClient MANDAT_SIGNE/RECURRENT)
      const isActiveClient = inCrm
        ? await prisma.client.findFirst({
            where: {
              entrepriseId: inCrm.id,
              statutClient: { in: ['MANDAT_SIGNE', 'RECURRENT'] },
            },
            select: { id: true },
          })
        : null;

      await prisma.marketListEstablishment.create({
        data: {
          marketListId: listId,
          name: companyNorm,
          city: cityGuess,
          sector: cand.sector || null,
          titles: exp.title ? [exp.title] : [],
          frequency: 1,
          status: isActiveClient ? 'CLIENT_EXISTING' : 'NEW',
          entrepriseId: inCrm?.id ?? null,
        },
      });
      summary.new += 1;
    }
  }

  return { candidat: { id: candidat.id, nom: candidat.nom, prenom: candidat.prenom }, summary };
}

// ─── Génération mandats prospection ────────────

/**
 * Bulk-create : pour chaque establishment != EXCLUDED && != CLIENT_EXISTING,
 * crée Entreprise (find-or-create) + Client(statutClient=LEAD).
 *
 * Retourne { created: N } et met à jour establishment.status = PROSPECTION.
 */
export async function generateProspectionLeads(listId: string, createdById: string) {
  const list = await getList(listId);

  const targets = list.establishments.filter(
    (e) => e.status !== 'EXCLUDED' && e.status !== 'CLIENT_EXISTING',
  );

  let created = 0;
  for (const est of targets) {
    // find-or-create Entreprise
    let entreprise = est.entrepriseId
      ? await prisma.entreprise.findUnique({ where: { id: est.entrepriseId } })
      : await prisma.entreprise.findFirst({
          where: { nom: { equals: est.name, mode: 'insensitive' } },
        });

    if (!entreprise) {
      entreprise = await prisma.entreprise.create({
        data: {
          nom: est.name,
          localisation: est.city,
          secteur: est.sector,
          createdById,
        },
      });
    }

    // Cree un Client placeholder (statutClient=LEAD) avec le premier titre trouvé
    const posteCible = est.titles?.[0] ?? 'À qualifier';
    const clientNom = `Contact ${est.name}`.slice(0, 200);
    await prisma.client.create({
      data: {
        nom: clientNom,
        entrepriseId: entreprise.id,
        poste: posteCible,
        statutClient: 'LEAD',
        typeClient: 'OUTBOUND',
        notes: `Cible identifiée depuis List Push "${list.name}" (${est.frequency} candidat${est.frequency > 1 ? 's' : ''} ingéré${est.frequency > 1 ? 's' : ''} passé${est.frequency > 1 ? 's' : ''} par cette boîte).`,
        createdById,
        assignedToId: createdById,
      },
    });

    await prisma.marketListEstablishment.update({
      where: { id: est.id },
      data: { status: 'PROSPECTION', entrepriseId: entreprise.id },
    });
    created += 1;
  }

  return { created, skippedExisting: list.establishments.length - targets.length };
}
