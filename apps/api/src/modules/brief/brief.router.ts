import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSlackConfig, sendToWebhook } from '../slack/slack.service.js';

// Brief de qualification rempli par un client via le formulaire HumanUp (site
// public). Reçu ici → notification Slack via la config Slack de l'ATS (celle
// qui sert déjà aux candidatures). Aucune auth : endpoint public.

const itemSchema = z.object({
  q: z.string().max(300).optional().default(''),
  a: z.string().max(4000).optional().default(''),
});
const sectionSchema = z.object({
  num: z.string().max(8).optional().default(''),
  title: z.string().max(160).optional().default(''),
  items: z.array(itemSchema).max(40).optional().default([]),
});
const briefSchema = z.object({
  poste: z.string().max(160).optional().default('Business Manager (ESN)'),
  societe: z.string().max(200).optional().default(''),
  nom: z.string().max(200).optional().default(''),
  email: z.string().max(200).optional().default(''),
  date: z.string().max(60).optional().default(''),
  website: z.string().max(200).optional().default(''), // honeypot anti-spam
  sections: z.array(sectionSchema).max(20).optional().default([]),
});

const mk = (s: string): string =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Public (aucune auth) : /api/v1/public/brief ──
export async function briefPublicRouter(fastify: FastifyInstance) {
  fastify.post('/', {
    schema: { tags: ['Public'] },
    handler: async (request, reply) => {
      const input = briefSchema.parse(request.body ?? {});
      if (input.website.trim()) return { ok: true }; // honeypot rempli = bot

      const config = await getSlackConfig();
      if (!config || !config.enabled || !config.webhookUrl) {
        return reply.code(503).send({ ok: false, error: 'not_configured' });
      }

      const poste = input.poste.trim() || 'Business Manager (ESN)';
      const societe = input.societe.trim();
      const nom = input.nom.trim();

      const metaBits = [
        societe && `*Société :* ${mk(societe)}`,
        nom && `*Répondant :* ${mk(nom)}`,
        input.email.trim() && `*Email :* ${mk(input.email.trim())}`,
        input.date.trim() && `*Échange prévu le :* ${mk(input.date.trim())}`,
      ]
        .filter(Boolean)
        .join('   ·   ');

      const blocks: object[] = [
        {
          type: 'header',
          text: { type: 'plain_text', text: `📋 Brief reçu — ${poste}`.slice(0, 150), emoji: true },
        },
      ];
      if (metaBits) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: metaBits.slice(0, 2900) } });
      blocks.push({ type: 'divider' });

      for (const s of input.sections) {
        const lines = (s.items || [])
          .filter((it) => (it.a || '').trim())
          .map((it) => `• *${mk((it.q || '').slice(0, 200))}*\n${mk((it.a || '').slice(0, 900))}`);
        if (!lines.length) continue;
        let txt = `*${mk(s.num)} · ${mk(s.title)}*\n\n${lines.join('\n\n')}`;
        if (txt.length > 2900) txt = `${txt.slice(0, 2890)}\n…`;
        blocks.push({ type: 'section', text: { type: 'mrkdwn', text: txt } });
        blocks.push({ type: 'divider' });
      }

      const fallback = `Brief reçu — ${poste}${societe ? ` — ${societe}` : ''}${nom ? ` (${nom})` : ''}`;

      try {
        await sendToWebhook(config.webhookUrl, { text: fallback, blocks: blocks.slice(0, 48) });
      } catch (err) {
        request.log.error({ err }, '[brief] Slack send failed');
        return reply.code(502).send({ ok: false, error: 'send_failed' });
      }
      return { ok: true };
    },
  });
}
