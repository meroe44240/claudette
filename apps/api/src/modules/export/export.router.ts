import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { ValidationError } from '../../lib/errors.js';
import * as exportService from './export.service.js';

type EntityType = 'candidats' | 'clients' | 'entreprises' | 'mandats';

const ENTITY_EXPORTERS: Record<EntityType, (ids?: string[]) => Promise<string>> = {
  candidats: exportService.exportCandidatsCSV,
  clients: exportService.exportClientsCSV,
  entreprises: exportService.exportEntreprisesCSV,
  mandats: exportService.exportMandatsCSV,
};

export default async function exportRouter(fastify: FastifyInstance) {
  // Generic handler for all entity exports
  const entityTypes: EntityType[] = ['candidats', 'clients', 'entreprises', 'mandats'];

  for (const entityType of entityTypes) {
    fastify.get(`/${entityType}`, {
      schema: {
        description: `Exporter les ${entityType} au format CSV`,
        tags: ['Export'],
        querystring: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['csv'] },
            ids: { type: 'string', description: 'IDs séparés par des virgules' },
          },
        },
      },
      preHandler: [authenticate],
      handler: async (request, reply) => {
        const query = request.query as { format?: string; ids?: string };

        if (query.format !== 'csv') {
          throw new ValidationError('Format non supporté. Utilisez format=csv');
        }

        const ids = query.ids
          ? query.ids.split(',').map((id) => id.trim()).filter(Boolean)
          : undefined;

        const exporter = ENTITY_EXPORTERS[entityType];
        const csv = await exporter(ids);

        const today = new Date().toISOString().split('T')[0];
        const filename = `${entityType}-export-${today}.csv`;

        reply
          .header('Content-Type', 'text/csv; charset=utf-8')
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .send(csv);
      },
    });
  }
}
