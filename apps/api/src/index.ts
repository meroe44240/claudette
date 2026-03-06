import dotenv from 'dotenv';
dotenv.config({ override: true });
import path from 'path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { errorHandler } from './middleware/error-handler.js';
import authRouter from './modules/auth/auth.router.js';
import entrepriseRouter from './modules/entreprises/entreprise.router.js';
import clientRouter from './modules/clients/client.router.js';
import candidatRouter from './modules/candidats/candidat.router.js';
import mandatRouter from './modules/mandats/mandat.router.js';
import candidatureRouter from './modules/candidatures/candidature.router.js';
import searchRouter from './modules/search/search.router.js';
import activiteRouter from './modules/activites/activite.router.js';
import tacheRouter from './modules/taches/tache.router.js';
import templateRouter from './modules/templates/template.router.js';
import notificationRouter from './modules/notifications/notification.router.js';
import dashboardRouter from './modules/dashboard/dashboard.router.js';
import settingsRouter from './modules/settings/settings.router.js';
import integrationRouter from './modules/integrations/integration.router.js';
import transcriptRouter from './modules/transcripts/transcript.router.js';
import importRouter from './modules/import/import.router.js';
import aiRouter from './modules/ai/ai.router.js';
import calendarAiRouter from './modules/ai/calendar-ai.router.js';
import pipelineAiRouter from './modules/ai/pipeline-ai.router.js';
import sequenceRouter from './modules/sequences/sequence.router.js';
import sdrRouter from './modules/sdr/sdr.router.js';
import adchaseRouter from './modules/adchase/adchase.router.js';
import adminRouter from './modules/admin/admin.router.js';
import exportRouter from './modules/export/export.router.js';
import emailRouter from './modules/email/email.router.js';
import auditRouter from './modules/audit/audit.router.js';
import reminderRouter from './modules/reminders/reminder.router.js';
import documentRouter from './modules/documents/document.router.js';
import pipelineRouter from './modules/clients/pipeline.router.js';
import adminDashboardRouter from './modules/dashboard/admin-dashboard.router.js';
import reportRouter from './modules/reports/report.router.js';
import statsRouter from './modules/stats/stats.router.js';
import slackRouter from './modules/slack/slack.router.js';

const PORT = parseInt(process.env.API_PORT || '3001', 10);

async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  app.setErrorHandler(errorHandler);

  await app.register(cors, {
    origin: (origin, cb) => {
      const allowed = process.env.APP_URL || 'http://localhost:5173';
      // Allow the main app, Chrome extension origins, and requests with no origin (e.g. server-to-server)
      if (
        !origin ||
        origin === allowed ||
        origin.startsWith('chrome-extension://') ||
        origin === 'http://localhost:5173'
      ) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    credentials: true,
  });

  await app.register(cookie);
  await app.register(formbody);
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
  });

  await app.register(rateLimit, {
    max: (request, key) => {
      if (key.startsWith('apikey:')) return 100;
      return 30;
    },
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      if (request.headers['x-api-key']) return `apikey:${request.headers['x-api-key']}`;
      return request.ip;
    },
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'HumanUp ATS/CRM API',
        version: '1.0.0',
        description: 'API pour le système ATS/CRM HumanUp',
      },
      servers: [{ url: `http://localhost:${PORT}` }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
  });

  // Health check
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // API routes
  await app.register(authRouter, { prefix: '/api/v1/auth' });
  await app.register(entrepriseRouter, { prefix: '/api/v1/entreprises' });
  await app.register(clientRouter, { prefix: '/api/v1/clients' });
  await app.register(candidatRouter, { prefix: '/api/v1/candidats' });
  await app.register(mandatRouter, { prefix: '/api/v1/mandats' });
  await app.register(candidatureRouter, { prefix: '/api/v1/candidatures' });
  await app.register(searchRouter, { prefix: '/api/v1/search' });
  await app.register(activiteRouter, { prefix: '/api/v1/activites' });
  await app.register(tacheRouter, { prefix: '/api/v1/taches' });
  await app.register(templateRouter, { prefix: '/api/v1/templates' });
  await app.register(notificationRouter, { prefix: '/api/v1/notifications' });
  await app.register(dashboardRouter, { prefix: '/api/v1/dashboard' });
  await app.register(settingsRouter, { prefix: '/api/v1/settings' });
  await app.register(integrationRouter, { prefix: '/api/v1/integrations' });
  await app.register(transcriptRouter, { prefix: '/api/v1/transcripts' });
  await app.register(importRouter, { prefix: '/api/v1/import' });
  await app.register(aiRouter, { prefix: '/api/v1/ai' });
  await app.register(calendarAiRouter, { prefix: '/api/v1/ai/calendar' });
  await app.register(pipelineAiRouter, { prefix: '/api/v1/ai/pipeline' });
  await app.register(sequenceRouter, { prefix: '/api/v1/sequences' });
  await app.register(sdrRouter, { prefix: '/api/v1/sdr' });
  await app.register(adchaseRouter, { prefix: '/api/v1/adchase' });
  await app.register(adminRouter, { prefix: '/api/v1/admin' });
  await app.register(exportRouter, { prefix: '/api/v1/export' });
  await app.register(emailRouter, { prefix: '/api/v1/emails' });
  await app.register(auditRouter, { prefix: '/api/v1/audit' });
  await app.register(reminderRouter, { prefix: '/api/v1/reminders' });
  await app.register(documentRouter, { prefix: '/api/v1/documents' });
  await app.register(pipelineRouter, { prefix: '/api/v1/clients-pipeline' });
  await app.register(adminDashboardRouter, { prefix: '/api/v1/dashboard/admin' });
  await app.register(reportRouter, { prefix: '/api/v1/reports' });
  await app.register(statsRouter, { prefix: '/api/v1/stats' });
  await app.register(slackRouter, { prefix: '/api/v1/slack' });

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

export { buildApp };

const isMainModule = process.argv[1]?.includes('index');
if (isMainModule && process.env.NODE_ENV !== 'test') {
  start();

  if (process.env.NODE_ENV !== 'test') {
    import('./jobs/feedback-reminder.job.js').then(({ startFeedbackWorker }) => {
      startFeedbackWorker();
    }).catch(err => console.error('Failed to start feedback worker:', err));

    import('./jobs/cron.js').then(({ startCronJobs }) => {
      startCronJobs();
    }).catch(err => console.error('Failed to start cron jobs:', err));
  }
}
