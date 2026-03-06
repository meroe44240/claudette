import { FastifyInstance } from 'fastify';
import * as reportService from './report.service.js';
import { authenticate } from '../../middleware/auth.js';

export default async function reportRouter(fastify: FastifyInstance) {
  // GET /client/:clientId - Generate client report
  fastify.get('/client/:clientId', {
    schema: {
      description: 'Generer un rapport d\'avancement client (HTML pour impression PDF)',
      tags: ['Reports'],
      params: {
        type: 'object',
        required: ['clientId'],
        properties: {
          clientId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['html', 'json'], default: 'html' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { clientId } = request.params as { clientId: string };
      const { format = 'html' } = request.query as { format?: string };

      const data = await reportService.getClientReport(clientId);

      if (format === 'json') {
        return data;
      }

      const html = reportService.generateClientReportHtml(data);
      reply.type('text/html').send(html);
    },
  });

  // GET /mandat/:mandatId - Generate mandat report
  fastify.get('/mandat/:mandatId', {
    schema: {
      description: 'Generer un rapport de mandat (HTML pour impression PDF)',
      tags: ['Reports'],
      params: {
        type: 'object',
        required: ['mandatId'],
        properties: {
          mandatId: { type: 'string', format: 'uuid' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          format: { type: 'string', enum: ['html', 'json'], default: 'html' },
        },
      },
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const { mandatId } = request.params as { mandatId: string };
      const { format = 'html' } = request.query as { format?: string };

      const data = await reportService.getMandatReport(mandatId);

      if (format === 'json') {
        return data;
      }

      const html = reportService.generateMandatReportHtml(data);
      reply.type('text/html').send(html);
    },
  });
}
