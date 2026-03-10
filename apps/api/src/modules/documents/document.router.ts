import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import * as documentService from './document.service.js';
import type { EntityType } from './document.service.js';

const VALID_ENTITY_TYPES = new Set(['candidat', 'client', 'entreprise', 'mandat']);

function validateEntityType(value: string): EntityType {
  if (!VALID_ENTITY_TYPES.has(value)) {
    throw new ValidationError(
      `Type d'entité invalide: ${value}. Types acceptés: candidat, client, entreprise, mandat`,
    );
  }
  return value as EntityType;
}

export default async function documentRouter(fastify: FastifyInstance) {
  // POST /upload — Upload a document (multipart)
  fastify.post('/upload', {
    schema: {
      description: 'Téléverser un document (PDF, DOC, DOCX, PNG, JPG, max 10 Mo)',
      tags: ['Documents'],
      consumes: ['multipart/form-data'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const data = await request.file();

      if (!data) {
        throw new ValidationError('Aucun fichier envoyé');
      }

      // Read the file fields
      const fields = data.fields as Record<string, any>;
      const entityTypeField = fields.entityType;
      const entityIdField = fields.entityId;

      if (!entityTypeField?.value || !entityIdField?.value) {
        throw new ValidationError('Les champs entityType et entityId sont requis');
      }

      const entityType = validateEntityType(entityTypeField.value as string);
      const entityId = entityIdField.value as string;

      // Read the file buffer
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      const doc = await documentService.upload(
        entityType,
        entityId,
        fileBuffer,
        data.filename,
        data.mimetype,
      );

      reply.status(201);
      return doc;
    },
  });

  // GET / — List documents for an entity
  fastify.get('/', {
    schema: {
      description: 'Lister les documents d\'une entité',
      tags: ['Documents'],
      querystring: {
        type: 'object',
        required: ['entityType', 'entityId'],
        properties: {
          entityType: { type: 'string' },
          entityId: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as { entityType: string; entityId: string };
      const entityType = validateEntityType(query.entityType);
      return documentService.listByEntity(entityType, query.entityId);
    },
  });

  // DELETE /:id — Delete a document
  fastify.delete('/:id', {
    schema: {
      description: 'Supprimer un document',
      tags: ['Documents'],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      querystring: {
        type: 'object',
        required: ['entityType', 'entityId'],
        properties: {
          entityType: { type: 'string' },
          entityId: { type: 'string' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };
      const query = request.query as { entityType: string; entityId: string };
      const entityType = validateEntityType(query.entityType);

      await documentService.remove(entityType, query.entityId, id);
      return { message: 'Document supprimé' };
    },
  });
}
