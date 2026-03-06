import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { FastifyInstance } from 'fastify';
import { createCandidatSchema, updateCandidatSchema } from './candidat.schema.js';
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
        query.assignedToId,
        stages,
        query.dateAddedPeriod,
      );
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
}
