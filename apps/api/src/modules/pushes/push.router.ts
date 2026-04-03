import { FastifyInstance } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import prisma from '../../lib/db.js';
import * as pushService from './push.service.js';

// Admin middleware — only ADMIN users can access
async function requireAdmin(request: any, reply: any) {
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { role: true },
  });
  if (!user || user.role !== 'ADMIN') {
    reply.status(403);
    return reply.send({ error: 'Accès réservé aux administrateurs' });
  }
}

export default async function pushRouter(fastify: FastifyInstance) {
  // POST / — Create a push
  fastify.post('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const body = request.body as any;
    const userId = (request as any).userId as string;

    if (!body.candidate_id) return reply.status(400).send({ error: 'candidate_id requis' });
    if (!body.prospect?.company_name && !body.prospect?.id) return reply.status(400).send({ error: 'prospect.company_name ou prospect.id requis' });

    try {
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
    } catch (err: any) {
      if (err.code === 'P2003') {
        return reply.status(400).send({ error: 'Candidat ou recruteur introuvable' });
      }
      throw err;
    }
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

  // ── Static path routes BEFORE parametric /:id ──

  // GET /history — Full push history with rich data (paginated)
  fastify.get('/history', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const query = request.query as any;

    const result = await pushService.getPushHistory({
      page: query.page ? parseInt(query.page, 10) : undefined,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      recruiterId: query.recruiter_id,
      status: query.status,
      canal: query.canal,
      from: query.from,
      to: query.to,
      search: query.search,
    });

    return reply.send(result);
  });

  // GET /export — CSV export of push history (admin only)
  fastify.get('/export', {
    preHandler: [authenticate, requireAdmin],
  }, async (request, reply) => {
    const query = request.query as any;

    const csv = await pushService.exportPushesCSV({
      recruiterId: query.recruiter_id,
      status: query.status,
      canal: query.canal,
      from: query.from,
      to: query.to,
      search: query.search,
    });

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="pushes-export.csv"')
      .send(csv);
  });

  // GET /stats/team — Team push stats (admin)
  fastify.get('/stats/team', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const query = request.query as any;
    const result = await pushService.getTeamPushStats(query.period || 'this_month');
    return reply.send(result);
  });

  // GET /stats/dashboard — Rich dashboard stats
  fastify.get('/stats/dashboard', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const query = request.query as any;

    const result = await pushService.getDashboardStats({
      period: query.period,
      recruiterId: query.recruiter_id,
    });

    return reply.send(result);
  });

  // GET /by-candidat/:candidatId — Pushes for a candidate
  fastify.get('/by-candidat/:candidatId', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { candidatId } = request.params as any;
    const result = await pushService.getPushesByCandidatId(candidatId);
    return reply.send(result);
  });

  // GET /by-client-email/:email — Pushes for a client (by email)
  fastify.get('/by-client-email/:email', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { email } = request.params as any;
    const result = await pushService.getPushesByClientEmail(email);
    return reply.send(result);
  });

  // ── Parametric routes LAST ──

  // PATCH /:id — Update push status
  fastify.patch('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const body = request.body as any;

    if (!body.status) return reply.status(400).send({ error: 'status requis' });

    const validStatuses = ['ENVOYE', 'OUVERT', 'REPONDU', 'RDV_BOOK', 'CONVERTI_MANDAT', 'SANS_SUITE'];
    if (!validStatuses.includes(body.status)) {
      return reply.status(400).send({ error: `Statut invalide. Valeurs acceptees: ${validStatuses.join(', ')}` });
    }

    try {
      const result = await pushService.updatePushStatus(id, body.status);
      return reply.send(result);
    } catch (err: any) {
      if (err.code === 'P2025' || err.message === 'Push non trouve') {
        return reply.status(404).send({ error: 'Push introuvable' });
      }
      throw err;
    }
  });

  // GET /:id — Get single push detail
  fastify.get('/:id', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { id } = request.params as any;
    const result = await pushService.getPushById(id);
    if (!result) return reply.status(404).send({ error: 'Push introuvable' });
    return reply.send(result);
  });
}
