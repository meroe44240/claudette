/**
 * Sourcing Kalent — recherche de talents + ajout au mandat + enrichissement.
 * /api/v1/sourcing/kalent (authentifie). Clef API Kalent partagee cote serveur.
 * (Distinct du module List Push qui vit sur /api/v1/sourcing/market-lists.)
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import prisma from '../../lib/db.js';
import { ConflictError } from '../../lib/errors.js';
import * as kalent from '../integrations/kalent.service.js';
import * as candidatService from '../candidats/candidat.service.js';
import * as candidatureService from '../candidatures/candidature.service.js';

const filterSchema = z.object({
  filterType: z.string().min(1),
  value: z.string().min(1),
  isRequired: z.boolean().optional(),
  isExcluded: z.boolean().optional(),
  isExactMatch: z.boolean().optional(),
  radius: z.number().optional(),
});

const searchSchema = z.object({
  mode: z.enum(['filters', 'prompt']),
  prompt: z.string().optional(),
  filters: z.array(filterSchema).optional(),
  relatedTransactionIds: z.array(z.string()).optional(),
});

const addSchema = z.object({
  mandatId: z.string().min(1).nullable().optional(),
  candidat: z.object({
    nom: z.string().min(1),
    prenom: z.string().optional().nullable(),
    linkedinUrl: z.string().optional().nullable(),
    photoUrl: z.string().optional().nullable(),
    posteActuel: z.string().optional().nullable(),
    entrepriseActuelle: z.string().optional().nullable(),
    localisation: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    telephone: z.string().optional().nullable(),
  }),
});

export default async function kalentSourcingRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // Etat de configuration (cle Kalent presente ?)
  fastify.get('/config', {
    schema: { tags: ['Sourcing'] },
    handler: () => ({ configured: kalent.isConfigured() }),
  });

  // Recherche (filtres structures ou prompt)
  fastify.post('/search', {
    schema: { tags: ['Sourcing'] },
    handler: async (request) => {
      if (!kalent.isConfigured()) {
        return { configured: false, error: 'Integration Kalent non configuree cote serveur.' };
      }
      const body = searchSchema.parse(request.body);
      const related = body.relatedTransactionIds ?? [];
      const result =
        body.mode === 'prompt'
          ? await kalent.searchByPrompt(body.prompt ?? '', related)
          : await kalent.searchTalents(body.filters ?? [], related);
      return { configured: true, ...result };
    },
  });

  // Enrichissement : demarrer (renvoie talentId)
  fastify.post('/enrich', {
    schema: { tags: ['Sourcing'] },
    handler: (request) => {
      const { linkedinUrl } = z.object({ linkedinUrl: z.string().min(1) }).parse(request.body);
      return kalent.startEnrichment(linkedinUrl, 'all');
    },
  });

  // Enrichissement : recuperer le resultat
  fastify.get('/enrich', {
    schema: { tags: ['Sourcing'] },
    handler: (request) => {
      const { talentId } = z.object({ talentId: z.string().min(1) }).parse(request.query);
      return kalent.getEnrichment(talentId);
    },
  });

  // Ajout d'un talent a l'ATS (+ rattachement mandat au stage SOURCING)
  fastify.post('/add', {
    schema: { tags: ['Sourcing'] },
    handler: async (request, reply) => {
      const body = addSchema.parse(request.body);
      const c = body.candidat;

      // Dedup : par LinkedIn si dispo, sinon par nom+prenom
      let candidat: { id: string } | null = null;
      if (c.linkedinUrl) {
        candidat = await prisma.candidat.findFirst({
          where: { linkedinUrl: c.linkedinUrl },
          select: { id: true },
        });
      }
      if (!candidat && c.nom) {
        candidat = await prisma.candidat.findFirst({
          where: { nom: c.nom, prenom: c.prenom ?? undefined },
          select: { id: true },
        });
      }

      let candidatId: string;
      let created = false;
      if (candidat) {
        candidatId = candidat.id;
        // Complete les coordonnees si on vient de les enrichir
        if (c.email || c.telephone) {
          await prisma.candidat.update({
            where: { id: candidatId },
            data: {
              ...(c.email ? { email: c.email } : {}),
              ...(c.telephone ? { telephone: c.telephone } : {}),
            },
          });
        }
      } else {
        const newC = await candidatService.create(
          {
            nom: c.nom,
            prenom: c.prenom ?? undefined,
            email: c.email ?? undefined,
            telephone: c.telephone ?? undefined,
            linkedinUrl: c.linkedinUrl ?? undefined,
            photoUrl: c.photoUrl ?? undefined,
            posteActuel: c.posteActuel ?? undefined,
            entrepriseActuelle: c.entrepriseActuelle ?? undefined,
            localisation: c.localisation ?? undefined,
            source: 'Kalent',
          } as Parameters<typeof candidatService.create>[0],
          request.userId,
        );
        candidatId = newC.id;
        created = true;
      }

      let candidatureId: string | null = null;
      let alreadyInMandat = false;
      if (body.mandatId) {
        try {
          const cand = await candidatureService.create(
            { mandatId: body.mandatId, candidatId, stage: 'SOURCING' } as Parameters<typeof candidatureService.create>[0],
            request.userId,
          );
          candidatureId = cand.id;
        } catch (e) {
          if (e instanceof ConflictError) alreadyInMandat = true;
          else throw e;
        }
      }

      reply.code(created ? 201 : 200);
      return { candidatId, candidatureId, created, alreadyInMandat, duplicate: !created };
    },
  });
}
