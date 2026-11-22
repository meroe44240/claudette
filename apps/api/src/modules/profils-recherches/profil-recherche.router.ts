import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import * as service from './profil-recherche.service.js';

// /api/v1/profils-recherches : lecture pour toute l'équipe, écriture admins + comptes agents
export default async function profilRechercheRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  const actor = (r: { userId: string; userRole: any }) => ({ userId: r.userId, userRole: r.userRole });

  fastify.get('/', { schema: { tags: ['ProfilsRecherches'] }, handler: (request) => service.search(request.query) });

  fastify.get('/facets', { schema: { tags: ['ProfilsRecherches'] }, handler: () => service.facets() });

  fastify.get('/export', {
    schema: { tags: ['ProfilsRecherches'] },
    handler: async (request, reply) => {
      const csv = await service.exportCsv(request.query);
      const date = new Date().toISOString().slice(0, 10);
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="profils-recherches-${date}.csv"`);
      return csv;
    },
  });

  fastify.get('/entreprise/:id', {
    schema: { tags: ['ProfilsRecherches'] },
    handler: (request) => service.getByCompany((request.params as { id: string }).id),
  });

  fastify.get('/match/:candidatId', {
    schema: { tags: ['ProfilsRecherches'] },
    handler: (request) => service.matchCandidate((request.params as { candidatId: string }).candidatId),
  });

  fastify.put('/', {
    schema: { tags: ['ProfilsRecherches'] },
    handler: (request) => service.upsert(request.body, actor(request)),
  });

  fastify.put('/entreprise/:id/resume', {
    schema: { tags: ['ProfilsRecherches'] },
    handler: (request) => service.setSummary((request.params as { id: string }).id, String((request.body as any)?.resume_profils ?? ''), actor(request)),
  });

  fastify.delete('/:id', {
    schema: { tags: ['ProfilsRecherches'] },
    handler: (request) => service.remove((request.params as { id: string }).id, actor(request)),
  });
}
