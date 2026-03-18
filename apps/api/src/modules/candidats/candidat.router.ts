import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { FastifyInstance } from 'fastify';
import { createCandidatSchema, updateCandidatSchema, createExperienceSchema, updateExperienceSchema } from './candidat.schema.js';
import * as candidatService from './candidat.service.js';
import * as activiteService from '../activites/activite.service.js';
import prisma from '../../lib/db.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

export default async function candidatRouter(fastify: FastifyInstance) {
  // GET / - List candidats with filters
  fastify.get('/', {
    schema: {
      description: 'Lister les candidats avec filtres et pagination',
      tags: ['Candidats'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string' },
          perPage: { type: 'string' },
          search: { type: 'string' },
          localisation: { type: 'string' },
          source: { type: 'string' },
          tags: { type: 'string', description: 'Comma-separated tags' },
          salaireMin: { type: 'string' },
          salaireMax: { type: 'string' },
          poste: { type: 'string' },
          entreprise: { type: 'string' },
          disponibilite: { type: 'string' },
          assignedToId: { type: 'string' },
          stage: { type: 'string', description: 'Comma-separated stages' },
          dateAddedPeriod: { type: 'string', enum: ['week', 'month', '3months', 'year'] },
          sortBy: { type: 'string' },
          sortDir: { type: 'string', enum: ['asc', 'desc'] },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as any;
      const params = parsePagination(query);
      const tags = query.tags ? (query.tags as string).split(',').map((t: string) => t.trim()) : undefined;
      const salaireMin = query.salaireMin ? parseInt(query.salaireMin, 10) : undefined;
      const salaireMax = query.salaireMax ? parseInt(query.salaireMax, 10) : undefined;
      const stages = query.stage ? (query.stage as string).split(',').map((s: string) => s.trim()) : undefined;

      // Non-admin: auto-filter by own userId
      let assignedToId: string | undefined;
      if (request.userRole !== 'ADMIN') {
        assignedToId = request.userId;
      } else if (query.assignedToId && query.assignedToId !== 'all') {
        assignedToId = query.assignedToId;
      }

      return candidatService.list(
        params,
        query.search,
        query.localisation,
        query.source,
        tags,
        salaireMin,
        salaireMax,
        query.poste,
        query.entreprise,
        query.disponibilite,
        assignedToId,
        stages,
        query.dateAddedPeriod,
        query.sortBy,
        query.sortDir,
      );
    },
  });

  // GET /tags - List all distinct tags for autocomplete
  fastify.get('/tags', {
    schema: {
      description: 'Lister tous les tags distincts',
      tags: ['Candidats'],
    },
    preHandler: [authenticate],
    handler: async () => {
      const result = await prisma.$queryRaw<{ tag: string }[]>`
        SELECT DISTINCT unnest(tags) as tag FROM "candidats" WHERE tags IS NOT NULL ORDER BY tag
      `;
      return result.map((r) => r.tag);
    },
  });

  // GET /duplicates - Detect duplicate candidates
  fastify.get('/duplicates', {
    schema: { description: 'Detect duplicate candidates', tags: ['Candidats'] },
    preHandler: [authenticate],
    handler: async () => {
      const { detectDuplicates } = await import('./duplicate.service.js');
      return detectDuplicates();
    },
  });

  // POST /merge - Merge two candidates
  fastify.post('/merge', {
    schema: { description: 'Merge duplicate candidates', tags: ['Candidats'] },
    preHandler: [authenticate],
    handler: async (request) => {
      const { primaryId, duplicateId } = request.body as { primaryId: string; duplicateId: string };
      const { mergeCandidates } = await import('./duplicate.service.js');
      return mergeCandidates(primaryId, duplicateId);
    },
  });

  // GET /engagement - Engagement scoring for candidats
  fastify.get('/engagement', {
    schema: { description: 'Candidat engagement scoring', tags: ['Candidats'] },
    preHandler: [authenticate],
    handler: async () => {
      const { getEngagementScores } = await import('./engagement.service.js');
      return getEngagementScores();
    },
  });

  // POST / - Create candidat
  fastify.post('/', {
    schema: {
      description: 'Creer un candidat',
      tags: ['Candidats'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = createCandidatSchema.parse(request.body);
      const candidat = await candidatService.create(input, request.userId);
      reply.status((candidat as any)._updated ? 200 : 201);
      return candidat;
    },
  });

  // GET /check-duplicate - Check for duplicate candidat by email
  fastify.get('/check-duplicate', {
    schema: {
      description: 'Verifier si un candidat avec cet email existe deja',
      tags: ['Candidats'],
      querystring: {
        type: 'object',
        properties: {
          email: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { email } = request.query as { email?: string };
      if (!email) return { exists: false };
      return candidatService.checkDuplicate(email);
    },
  });

  // GET /:id - Get candidat by id
  fastify.get('/:id', {
    schema: {
      description: 'Recuperer un candidat par son ID',
      tags: ['Candidats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return candidatService.getById(id);
    },
  });

  // PUT /:id - Update candidat
  fastify.put('/:id', {
    schema: {
      description: 'Mettre a jour un candidat',
      tags: ['Candidats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = updateCandidatSchema.parse(request.body);
      return candidatService.update(id, input);
    },
  });

  // DELETE /:id - Delete candidat (admin only)
  fastify.delete('/:id', {
    schema: {
      description: 'Supprimer un candidat',
      tags: ['Candidats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await candidatService.remove(id);
      return { message: 'Candidat supprime' };
    },
  });

  // DELETE /:id/gdpr-delete - GDPR full deletion (admin only)
  fastify.delete('/:id/gdpr-delete', {
    schema: {
      description: 'Suppression RGPD complete du candidat et toutes ses donnees',
      tags: ['Candidats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      await candidatService.gdprDelete(id);
      return { message: 'Candidat et toutes ses donnees supprimees (RGPD)' };
    },
  });

  // GET /:id/export - GDPR data export
  fastify.get('/:id/export', {
    schema: {
      description: 'Export RGPD des donnees du candidat',
      tags: ['Candidats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      return candidatService.exportData(id);
    },
  });

  // GET /:id/engagement - Get engagement score
  fastify.get('/:id/engagement', {
    schema: {
      description: 'Get candidate engagement score',
      tags: ['Candidats'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      const { calculateEngagement } = await import('./engagement.service.js');
      return calculateEngagement(id);
    },
  });

  // GET /:id/activites - List activities for a candidat
  fastify.get('/:id/activites', {
    schema: {
      description: 'Lister les activites du candidat',
      tags: ['Candidats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as any;
      const params = parsePagination(query);
      return activiteService.listByEntite('CANDIDAT', id, params);
    },
  });

  // ─── EXPERIENCE ROUTES ──────────────────────────────

  // GET /:id/experiences
  fastify.get('/:id/experiences', {
    schema: {
      description: 'Lister les experiences professionnelles',
      tags: ['Candidats'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { id } = request.params as { id: string };
      return { data: await candidatService.listExperiences(id) };
    },
  });

  // POST /:id/experiences
  fastify.post('/:id/experiences', {
    schema: {
      description: 'Ajouter une experience professionnelle',
      tags: ['Candidats'],
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const input = createExperienceSchema.parse(request.body);
      const exp = await candidatService.createExperience(id, input);
      reply.status(201);
      return exp;
    },
  });

  // PUT /experiences/:expId
  fastify.put('/experiences/:expId', {
    schema: {
      description: 'Modifier une experience professionnelle',
      tags: ['Candidats'],
      params: { type: 'object', required: ['expId'], properties: { expId: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { expId } = request.params as { expId: string };
      const input = updateExperienceSchema.parse(request.body);
      return candidatService.updateExperience(expId, input);
    },
  });

  // DELETE /experiences/:expId
  fastify.delete('/experiences/:expId', {
    schema: {
      description: 'Supprimer une experience professionnelle',
      tags: ['Candidats'],
      params: { type: 'object', required: ['expId'], properties: { expId: { type: 'string', format: 'uuid' } } },
    },
    preHandler: [authenticate],
    handler: async (request) => {
      const { expId } = request.params as { expId: string };
      await candidatService.deleteExperience(expId);
      return { message: 'Experience supprimee' };
    },
  });

  // POST /:id/cv - Upload CV
  fastify.post('/:id/cv', {
    schema: {
      description: 'Upload du CV du candidat',
      tags: ['Candidats'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', format: 'uuid' } },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      // Verify candidat exists
      await candidatService.getById(id);

      const file = await request.file();
      if (!file) {
        reply.status(400);
        return { message: 'Aucun fichier fourni' };
      }

      const allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (!allowedMimes.includes(file.mimetype)) {
        reply.status(400);
        return { message: 'Format non supporté. Formats acceptés: PDF, DOC, DOCX' };
      }

      const uploadDir = path.join(process.cwd(), 'uploads', 'cv', id);
      await mkdir(uploadDir, { recursive: true });

      const fileName = `${Date.now()}-${file.filename}`;
      const filePath = path.join(uploadDir, fileName);
      const buffer = await file.toBuffer();
      await writeFile(filePath, buffer);

      const cvUrl = `/uploads/cv/${id}/${fileName}`;
      const updated = await prisma.candidat.update({
        where: { id },
        data: { cvUrl },
      });

      return { message: 'CV uploadé avec succès', cvUrl, candidat: updated };
    },
  });

  // POST /check-duplicate - Check for potential duplicates before creation
  fastify.post('/check-duplicate', {
    schema: {
      description: 'Vérifier les doublons potentiels (email / LinkedIn)',
      tags: ['Candidats'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { email, linkedinUrl, excludeId } = request.body as {
        email?: string;
        linkedinUrl?: string;
        excludeId?: string;
      };

      if (!email && !linkedinUrl) {
        return { duplicates: [] };
      }

      const conditions: any[] = [];
      if (email) conditions.push({ email: { equals: email, mode: 'insensitive' } });
      if (linkedinUrl) conditions.push({ linkedinUrl: { equals: linkedinUrl, mode: 'insensitive' } });

      const where: any = { OR: conditions };
      if (excludeId) {
        where.NOT = { id: excludeId };
      }

      const duplicates = await prisma.candidat.findMany({
        where,
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          linkedinUrl: true,
        },
        take: 5,
      });

      return { duplicates };
    },
  });
}
