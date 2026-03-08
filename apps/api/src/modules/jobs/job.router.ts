/**
 * Job Board routes — auth (back-office) + public (job board).
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as jobService from './job.service.js';
import { generateJobDescription, anonymizeFicheDePoste } from './job-ai.service.js';
import { authenticate } from '../../middleware/auth.js';
import { parsePagination } from '../../lib/pagination.js';

// ─── ZOD SCHEMAS ────────────────────────────────────

const createJobSchema = z.object({
  title: z.string().min(1, 'Le titre est requis'),
  mandatId: z.string().uuid().optional(),
  companyDescription: z.string().optional(),
  location: z.string().optional(),
  salaryRange: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  jobType: z.string().optional(),
  sector: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE_LINK']).optional(),
  isUrgent: z.boolean().optional(),
  assignedToId: z.string().uuid().optional(),
});

const updateJobSchema = z.object({
  title: z.string().min(1).optional(),
  companyDescription: z.string().optional(),
  location: z.string().optional(),
  salaryRange: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  jobType: z.string().optional(),
  sector: z.string().optional(),
  visibility: z.enum(['PUBLIC', 'PRIVATE_LINK']).optional(),
  isUrgent: z.boolean().optional(),
  assignedToId: z.string().uuid().optional(),
});

// ─── AUTH ROUTES (back-office) ──────────────────────

export default async function jobRouter(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);

  // List all job postings
  fastify.get('/', async (request) => {
    const query = request.query as { page?: string; perPage?: string; status?: string; search?: string };
    const pagination = parsePagination(query);
    return jobService.listAll(
      { status: query.status as any, search: query.search },
      pagination,
    );
  });

  // Get stats
  fastify.get('/stats', async () => {
    return jobService.getStats();
  });

  // Create job posting
  fastify.post('/', async (request, reply) => {
    const body = createJobSchema.parse(request.body);
    const userId = (request as any).userId as string;
    const job = await jobService.create(body, userId);
    return reply.status(201).send(job);
  });

  // Get job posting by id
  fastify.get<{ Params: { id: string } }>('/:id', async (request) => {
    const job = await jobService.getById(request.params.id);
    if (!job) return { error: 'Offre introuvable' };
    return job;
  });

  // Update job posting
  fastify.put<{ Params: { id: string } }>('/:id', async (request) => {
    const body = updateJobSchema.parse(request.body);
    return jobService.update(request.params.id, body);
  });

  // Publish
  fastify.post<{ Params: { id: string } }>('/:id/publish', async (request) => {
    return jobService.publish(request.params.id);
  });

  // Unpublish
  fastify.post<{ Params: { id: string } }>('/:id/unpublish', async (request) => {
    return jobService.unpublish(request.params.id);
  });

  // Archive
  fastify.post<{ Params: { id: string } }>('/:id/archive', async (request) => {
    return jobService.archive(request.params.id);
  });

  // List applications for a job posting
  fastify.get<{ Params: { id: string } }>('/:id/applications', async (request) => {
    const query = request.query as { page?: string; perPage?: string; status?: string };
    const pagination = parsePagination(query);
    return jobService.listApplications(request.params.id, { status: query.status }, pagination);
  });

  // Update application status
  fastify.put<{ Params: { appId: string } }>('/applications/:appId/status', async (request) => {
    const { status } = request.body as { status: 'REVIEWED' | 'SHORTLISTED' | 'REJECTED' };
    const userId = (request as any).userId as string;

    if (status === 'SHORTLISTED') {
      return jobService.shortlistApplication(request.params.appId, userId);
    }
    if (status === 'REJECTED') {
      return jobService.rejectApplication(request.params.appId, userId);
    }
    return jobService.updateApplicationStatus(request.params.appId, status, userId);
  });

  // Generate AI description
  fastify.post<{ Params: { id: string } }>('/:id/generate-description', async (request, reply) => {
    const job = await jobService.getById(request.params.id);
    if (!job?.mandatId) {
      return reply.status(400).send({ error: 'Cette offre n\'est pas liée à un mandat' });
    }

    const userId = (request as any).userId as string;
    const result = await generateJobDescription(job.mandatId, userId);

    if (!result) {
      return reply.status(500).send({ error: 'La génération IA a échoué' });
    }

    return result;
  });

  // Anonymize a fiche de poste via AI
  fastify.post('/anonymize-fiche', async (request, reply) => {
    const { text } = request.body as { text: string };
    if (!text || text.trim().length < 20) {
      return reply.status(400).send({ error: 'Texte trop court' });
    }
    const userId = (request as any).userId as string;
    const result = await anonymizeFicheDePoste(text, userId);
    if (!result) {
      return reply.status(500).send({ error: 'L\'anonymisation a échoué' });
    }
    return result;
  });
}

// ─── PUBLIC ROUTES (no auth) ────────────────────────

export async function jobPublicRouter(fastify: FastifyInstance) {
  // List published jobs
  fastify.get('/', async (request) => {
    const query = request.query as {
      page?: string;
      perPage?: string;
      search?: string;
      sector?: string;
      location?: string;
      jobType?: string;
      salaryMin?: string;
    };
    const pagination = parsePagination(query);
    return jobService.listPublished(
      {
        search: query.search,
        sector: query.sector,
        location: query.location,
        jobType: query.jobType,
        salaryMin: query.salaryMin ? parseInt(query.salaryMin, 10) : undefined,
      },
      pagination,
    );
  });

  // List sectors for filters
  fastify.get('/sectors', async () => {
    return jobService.listSectors();
  });

  // Get job by slug
  fastify.get<{ Params: { slug: string } }>('/:slug', async (request, reply) => {
    const job = await jobService.getBySlug(request.params.slug);
    if (!job) {
      return reply.status(404).send({ error: 'Offre introuvable' });
    }

    // Increment view count (non-blocking)
    jobService.incrementViewCount(job.id).catch(() => {});

    return job;
  });

  // Apply to a job (multipart: form fields + CV file)
  fastify.post<{ Params: { slug: string } }>('/:slug/apply', async (request, reply) => {
    const fields: Record<string, string> = {};
    let cvBuffer: Buffer | null = null;
    let cvFilename = '';

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          cvBuffer = await part.toBuffer();
          cvFilename = part.filename;
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }
    } catch {
      return reply.status(400).send({ error: 'Erreur lors de la lecture du formulaire' });
    }

    // Validate required fields
    if (!fields.firstName || !fields.lastName || !fields.email) {
      return reply.status(400).send({ error: 'Prénom, nom et email sont obligatoires' });
    }

    if (!z.string().email().safeParse(fields.email).success) {
      return reply.status(400).send({ error: 'Email invalide' });
    }

    try {
      const result = await jobService.processApplication(
        request.params.slug,
        {
          firstName: fields.firstName,
          lastName: fields.lastName,
          email: fields.email,
          phone: fields.phone,
          salaryCurrent: fields.salaryCurrent,
          currentCompany: fields.currentCompany,
          availability: fields.availability,
        },
        cvBuffer,
        cvFilename,
      );

      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Erreur lors de la candidature' });
    }
  });

  // Spontaneous application (multipart)
  fastify.post('/spontaneous', async (request, reply) => {
    const fields: Record<string, string> = {};
    let cvBuffer: Buffer | null = null;
    let cvFilename = '';

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          cvBuffer = await part.toBuffer();
          cvFilename = part.filename;
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }
    } catch {
      return reply.status(400).send({ error: 'Erreur lors de la lecture du formulaire' });
    }

    if (!fields.firstName || !fields.lastName || !fields.email) {
      return reply.status(400).send({ error: 'Prénom, nom et email sont obligatoires' });
    }

    if (!z.string().email().safeParse(fields.email).success) {
      return reply.status(400).send({ error: 'Email invalide' });
    }

    try {
      const result = await jobService.processSpontaneous(
        {
          firstName: fields.firstName,
          lastName: fields.lastName,
          email: fields.email,
          phone: fields.phone,
          salaryCurrent: fields.salaryCurrent,
          currentCompany: fields.currentCompany,
          availability: fields.availability,
          jobTypeSought: fields.jobTypeSought,
        },
        cvBuffer,
        cvFilename,
      );

      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || 'Erreur lors de la candidature' });
    }
  });
}
