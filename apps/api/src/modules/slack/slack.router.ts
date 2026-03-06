import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth.js';
import * as slackService from './slack.service.js';

const saveConfigSchema = z.object({
  webhookUrl: z.string().url().startsWith('https://hooks.slack.com/'),
  enabled: z.boolean(),
  sendTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

const testReportSchema = z.object({
  webhookUrl: z.string().url().startsWith('https://hooks.slack.com/').optional(),
});

export default async function slackRouter(fastify: FastifyInstance) {
  // POST /test - Send a test report (ADMIN only)
  fastify.post('/test', {
    schema: {
      description: 'Envoyer un rapport de test Slack',
      tags: ['Slack'],
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const body = testReportSchema.parse(request.body || {});
      const result = await slackService.sendTestReport(body.webhookUrl);
      if (!result.success) {
        reply.status(400);
      }
      return result;
    },
  });

  // POST /config - Save Slack configuration (ADMIN only)
  fastify.post('/config', {
    schema: {
      description: 'Sauvegarder la configuration Slack',
      tags: ['Slack'],
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const input = saveConfigSchema.parse(request.body);
      const config = await slackService.saveSlackConfig(request.userId, input);
      return config;
    },
  });

  // GET /config - Get current Slack configuration (ADMIN only)
  fastify.get('/config', {
    schema: {
      description: 'Obtenir la configuration Slack actuelle',
      tags: ['Slack'],
    },
    preHandler: [authenticate, requireRole('ADMIN')],
    handler: async (request, reply) => {
      const config = await slackService.getSlackConfig();
      if (!config) {
        return { webhookUrl: '', enabled: false, sendTime: '19:00' };
      }
      // Mask the webhook URL for security (show only last 10 chars)
      return {
        webhookUrl: config.webhookUrl,
        enabled: config.enabled,
        sendTime: config.sendTime || '19:00',
      };
    },
  });
}
