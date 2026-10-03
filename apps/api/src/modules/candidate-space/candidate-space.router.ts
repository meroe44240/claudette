/**
 * Espace candidat — routes HTTP (préfixe `/api/v1/candidate-space`).
 *
 * Trois blocs :
 * 1. Recruteur (auth ATS) : statut, pré-remplissage IA, invitation, révocation,
 *    message au candidat ajouté après coup.
 * 2. Public : activation, connexion, mot de passe oublié.
 * 3. Candidat (JWT type 'candidate') : son espace.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as service from './candidate-space.service.js';

type Account = Awaited<ReturnType<typeof service.authenticateCandidate>>;
declare module 'fastify' {
  interface FastifyRequest {
    candidateAccount?: Account;
  }
}

async function candidateAuthenticate(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'CANDIDATE_UNAUTHORIZED', message: 'Please sign in' });
    return reply;
  }
  try {
    request.candidateAccount = await service.authenticateCandidate(auth.slice(7));
  } catch {
    reply.code(401).send({ error: 'CANDIDATE_UNAUTHORIZED', message: 'Your session has expired' });
    return reply;
  }
}

const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } as const;
const strict = { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } };

export default async function candidateSpaceRouter(fastify: FastifyInstance) {
  // ── Recruteur ──────────────────────────────────────
  fastify.get('/candidats/:id', {
    schema: { tags: ['Espace candidat'], params: idParams }, preHandler: [authenticate],
    handler: (request) => service.getStatus((request.params as { id: string }).id),
  });
  fastify.post('/candidats/:id/prefill', {
    schema: { tags: ['Espace candidat'], params: idParams }, preHandler: [authenticate],
    handler: (request) => service.prefill((request.params as { id: string }).id, request.userId),
  });
  fastify.post('/candidats/:id/invite', {
    schema: { tags: ['Espace candidat'], params: idParams }, preHandler: [authenticate],
    handler: (request) => {
      const body = z.object({ profile: z.enum(['TECH', 'SALES']), expectations: z.record(z.string(), z.string()).default({}), otherProcesses: z.array(z.any()).default([]) }).parse(request.body);
      return service.invite((request.params as { id: string }).id, request.userId, body);
    },
  });
  fastify.post('/candidats/:id/revoke', {
    schema: { tags: ['Espace candidat'], params: idParams }, preHandler: [authenticate],
    handler: (request) => service.revoke((request.params as { id: string }).id),
  });
  fastify.post('/candidatures/:id/message', {
    schema: { tags: ['Espace candidat'], params: idParams }, preHandler: [authenticate],
    handler: (request) => {
      const { message } = z.object({ message: z.string().trim().min(1).max(2000) }).parse(request.body);
      return service.addMessage((request.params as { id: string }).id, request.userId, message);
    },
  });

  // ── Public ─────────────────────────────────────────
  fastify.get('/public/activation', {
    schema: { tags: ['Espace candidat'] },
    handler: (request) => service.activationContext(String((request.query as { token?: string }).token || '')),
  });
  fastify.post('/public/activate', {
    schema: { tags: ['Espace candidat'] }, ...strict,
    handler: (request) => {
      const body = z.object({
        token: z.string().min(10), password: z.string(), consent: z.boolean(),
        expectations: z.record(z.string(), z.string()).optional(), otherProcesses: z.array(z.any()).optional(),
      }).parse(request.body);
      return service.activate(body);
    },
  });
  fastify.post('/public/login', {
    schema: { tags: ['Espace candidat'] }, ...strict,
    handler: (request) => {
      const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(request.body);
      return service.login(email, password);
    },
  });
  fastify.post('/public/password-reset', {
    schema: { tags: ['Espace candidat'] }, config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    handler: async (request) => {
      const { email } = z.object({ email: z.string().email() }).parse(request.body);
      try { await service.requestPasswordReset(email); } catch (e) { request.log.error(e, '[Espace candidat] reset'); }
      return { ok: true };
    },
  });
  fastify.post('/public/password-reset/confirm', {
    schema: { tags: ['Espace candidat'] }, ...strict,
    handler: (request) => {
      const { token, password } = z.object({ token: z.string().min(10), password: z.string() }).parse(request.body);
      return service.confirmPasswordReset(token, password);
    },
  });

  // ── Candidat ───────────────────────────────────────
  fastify.get('/me', {
    schema: { tags: ['Espace candidat'] }, preHandler: [candidateAuthenticate],
    handler: (request) => service.me(request.candidateAccount!),
  });
  fastify.get('/processes', {
    schema: { tags: ['Espace candidat'] }, preHandler: [candidateAuthenticate],
    handler: (request) => service.processes(request.candidateAccount!.candidatId),
  });
  fastify.get('/processes/:id', {
    schema: { tags: ['Espace candidat'], params: idParams }, preHandler: [candidateAuthenticate],
    handler: (request) => service.processDetail(request.candidateAccount!.candidatId, (request.params as { id: string }).id),
  });
  fastify.get('/expectations', {
    schema: { tags: ['Espace candidat'] }, preHandler: [candidateAuthenticate],
    handler: (request) => service.getExpectations(request.candidateAccount!),
  });
  fastify.put('/expectations', {
    schema: { tags: ['Espace candidat'] }, preHandler: [candidateAuthenticate],
    handler: (request) => {
      const body = z.object({ expectations: z.record(z.string(), z.string()).optional(), otherProcesses: z.array(z.any()).optional() }).parse(request.body);
      return service.updateExpectations(request.candidateAccount!, body);
    },
  });
  fastify.get('/notifications', {
    schema: { tags: ['Espace candidat'] }, preHandler: [candidateAuthenticate],
    handler: (request) => service.notifications(request.candidateAccount!),
  });
}
