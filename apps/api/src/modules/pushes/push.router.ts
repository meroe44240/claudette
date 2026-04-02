import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import * as pushService from './push.service.js';

export default async function pushRouter(fastify: FastifyInstance) {
  // POST / — Create a push
  fastify.post('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const body = request.body as any;
    const userId = (request as any).userId as string;

    if (!body.candidate_id) return reply.status(400).send({ error: 'candidate_id requis' });
    if (!body.prospect?.company_name && !body.prospect?.id) return reply.status(400).send({ error: 'prospect.company_name ou prospect.id requis' });

    const result = await pushService.createPush({
      candidatId: body.candidate_id,
      prospect: {
        id: body.prospect.id,
        companyName: body.prospect.company_name,
        contactName: body.prospect.contact_name,
        contactEmail: body.prospect.contact_email,
        contactLinkedin: body.prospect.contact_linkedin,
        sector: body.prospect.sector,
      },
      canal: body.canal || 'EMAIL',
      message: body.message,
      recruiterId: body.recruiter_id || userId,
    });

    return reply.status(201).send(result);
  });

  // GET / — List pushes
  fastify.get('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const query = request.query as any;
    const userId = (request as any).userId as string;

    const result = await pushService.listPushes({
      recruiterId: query.recruiter_id || userId,
      period: query.period,
      status: query.status,
      team: query.team === 'true',
    });

    return reply.send(result);
  });

  // PATCH /:id — Update push status
  fastify.patch('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const body = request.body as any;

    if (!body.status) return reply.status(400).send({ error: 'status requis' });

    const result = await pushService.updatePushStatus(id, body.status);
    return reply.send(result);
  });

  // GET /stats/team — Team push stats (admin)
  fastify.get('/stats/team', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await pushService.getTeamPushStats(query.period || 'this_month');
    return reply.send(result);
  });
}
