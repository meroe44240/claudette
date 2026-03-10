import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import * as gmailService from '../integrations/gmail.service.js';

const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  htmlBody: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  inReplyTo: z.string().optional(),
  candidatId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  mandatId: z.string().uuid().optional(),
});

export default async function emailRouter(fastify: FastifyInstance) {
  // POST /send - Send an email via Gmail
  fastify.post('/send', {
    schema: {
      description: 'Envoyer un email via Gmail avec suivi d\'activité',
      tags: ['Emails'],
    },
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const input = sendEmailSchema.parse(request.body);

      const result = await gmailService.sendEmail(request.userId, {
        to: input.to,
        subject: input.subject,
        body: input.body,
        htmlBody: input.htmlBody,
        cc: input.cc,
        bcc: input.bcc,
        inReplyTo: input.inReplyTo,
      });

      reply.status(201);
      return result;
    },
  });
}
