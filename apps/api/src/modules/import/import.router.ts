import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import * as importService from './import.service.js';

// ─── ZOD SCHEMAS ────────────────────────────────────

const entityTypeSchema = z.enum(['candidat', 'client', 'entreprise', 'mandat']);

const previewSchema = z.object({
  rows: z.array(z.array(z.string())),
  mapping: z.record(z.string(), z.string()),
  entityType: entityTypeSchema,
});

const executeSchema = z.object({
  rows: z.array(z.array(z.string())),
  mapping: z.record(z.string(), z.string()),
  entityType: entityTypeSchema,
  skipDuplicates: z.boolean().default(false),
});

// ─── ROUTER ─────────────────────────────────────────

export default async function importRouter(fastify: FastifyInstance) {
  // POST /upload - Upload CSV file
  fastify.post('/upload', {
    schema: {
      description: 'Uploader un fichier CSV pour import',
      tags: ['Import'],
      querystring: {
        type: 'object',
        required: ['entityType'],
        properties: {
          entityType: {
            type: 'string',
            enum: ['candidat', 'client', 'entreprise', 'mandat'],
          },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const query = request.query as { entityType?: string };
      const entityType = entityTypeSchema.parse(query.entityType);

      const data = await request.file();

      if (!data) {
        throw new ValidationError('Aucun fichier fourni. Utilisez le champ "file" en multipart.');
      }

      // Validate file type
      const filename = data.filename.toLowerCase();
      if (!filename.endsWith('.csv') && !filename.endsWith('.txt') && !filename.endsWith('.tsv')) {
        throw new ValidationError('Format de fichier non supporte. Utilisez un fichier CSV, TSV ou TXT.');
      }

      const buffer = await data.toBuffer();

      if (buffer.length === 0) {
        throw new ValidationError('Le fichier est vide');
      }

      const parsed = importService.parseCSV(buffer);
      const autoMapping = importService.autoMapColumns(parsed.headers, entityType);

      // Return first 100 rows for the frontend
      const limitedRows = parsed.rows.slice(0, 100);

      return {
        headers: parsed.headers,
        rows: limitedRows,
        rowCount: parsed.rows.length,
        autoMapping,
      };
    },
  });

  // POST /preview - Preview import with given mapping
  fastify.post('/preview', {
    schema: {
      description: 'Previsualiser un import avec le mapping de colonnes',
      tags: ['Import'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = previewSchema.parse(request.body);
      const result = await importService.preview(input.rows, input.mapping, input.entityType);
      return result;
    },
  });

  // POST /execute - Execute import
  fastify.post('/execute', {
    schema: {
      description: 'Executer un import de donnees',
      tags: ['Import'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = executeSchema.parse(request.body);
      const result = await importService.executeImport(
        input.rows,
        input.mapping,
        input.entityType,
        request.userId,
        input.skipDuplicates,
      );
      return result;
    },
  });

  // POST /cvs - Upload bulk CVs
  fastify.post('/cvs', {
    schema: {
      description: 'Uploader des CVs en masse (PDF)',
      tags: ['Import'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const parts = request.files();
      const files: { filename: string; buffer: Buffer }[] = [];

      for await (const part of parts) {
        const buffer = await part.toBuffer();
        files.push({ filename: part.filename, buffer });
      }

      if (files.length === 0) {
        throw new ValidationError('Aucun fichier fourni. Utilisez le champ "files" en multipart.');
      }

      const results = importService.parseBulkCVs(files);

      return {
        processed: results.map((r) => ({
          filename: r.filename,
          candidatId: undefined, // Would be filled after actual CV parsing and candidat creation
          text: r.text,
        })),
      };
    },
  });
}
