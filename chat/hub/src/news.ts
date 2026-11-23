// Propium → #news: the three announcements (client meeting, presentation, closed won), and nothing else.
// Propium POSTs signed webhooks (X-Propium-Signature: sha256=<hmac of the raw body>), see Propium's webhook module.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { env } from './env.js';
import { q } from './db.js';
import { MM } from './mm.js';
import { ToolError, audit } from './core.js';
import { TEAM_TZ, channelId, systemBot } from './guard.js';

export const NEWS_TYPES = ['announcement.client_meeting', 'announcement.presentation', 'announcement.closed_won'] as const;

function secret(): string | null {
  const p = join(env.SECRETS_DIR, 'propium-webhook-secret');
  return process.env.PROPIUM_WEBHOOK_SECRET ?? (existsSync(p) ? readFileSync(p, 'utf8').trim() : null);
}

export function verifySignature(raw: string, header: string | undefined): boolean {
  const s = secret();
  if (!s || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', s).update(raw).digest('hex')}`);
  const got = Buffer.from(header);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

const when = (iso: unknown) => {
  if (!iso) return null;
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { timeZone: TEAM_TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .format(d).replace(/^(\w{3}),/, '$1'); // "Fri 27 Nov, 10:00"
};
const day = (iso: unknown) => {
  if (!iso) return null;
  const d = new Date(String(iso));
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-GB', { timeZone: TEAM_TZ, day: 'numeric', month: 'short', year: 'numeric' }).format(d);
};
const b = (s: unknown) => (s ? `**${String(s).replace(/\*/g, '')}**` : null);
const join_ = (parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(' · ');

/** One short line per announcement, in English (team channel). */
export function formatNews(type: string, d: Record<string, any>, by: string | null): string | null {
  const link = d.url ? `[Propium](${d.url})` : null;
  const who = b(d.by ?? by) ?? 'Someone';
  if (type === 'announcement.client_meeting') {
    const withWhom = d.contact ? `${b(d.contact)}${d.company ? ` (${d.company}${d.relationship ? `, ${d.relationship}` : ''})` : ''}`
      : d.company ? `${b(d.company)}${d.relationship ? ` (${d.relationship})` : ''}` : b(d.title);
    return `📅 ${join_([`${who} booked a meeting with ${withWhom}`, when(d.date), d.location, link])}`;
  }
  if (type === 'announcement.presentation') {
    const to = `${b(d.company)}${d.contact ? ` (${d.contact})` : ''}`;
    return `🤝 ${join_([`${who} presents ${b(d.candidate)} to ${to}${d.mandate ? ` for ${d.mandate}` : ''}`, when(d.date), link])}`;
  }
  if (type === 'announcement.closed_won') {
    const fee = d.fee ? `€${Number(d.fee).toLocaleString('en-GB')}${d.fee_percent ? ` (${d.fee_percent}%)` : ''}` : null;
    return `🎉 ${join_([`Closed won: ${b(d.candidate)} placed at ${b(d.company)}${d.mandate ? ` as ${d.mandate}` : ''}`,
      d.by ?? by, fee, d.start_date ? `starts ${day(d.start_date)}` : null, link])}`;
  }
  return null;
}

/** A signed Propium webhook: post the announcement in #news, once. */
export async function receivePropiumEvent(raw: string, signature: string | undefined) {
  if (!verifySignature(raw, signature)) throw new ToolError(401, 'Bad signature');
  const ev = JSON.parse(raw);
  if (ev.type === 'webhook.test') return { ok: true, test: true };
  if (!NEWS_TYPES.includes(ev.type)) return { ok: true, ignored: ev.type }; // nothing else from Propium reaches the chat
  const fresh = await q(`insert into propium_events (event_id, type, payload) values ($1,$2,$3) on conflict do nothing returning event_id`,
    [String(ev.id), ev.type, raw]);
  if (!fresh.length) return { ok: true, duplicate: true };
  const text = formatNews(ev.type, ev.details ?? {}, ev.by?.name ?? null);
  const [bot, news] = await Promise.all([systemBot('propium'), channelId('news')]);
  if (!text || !bot || !news) throw new ToolError(500, 'Cannot post in #news');
  const post = await new MM(env.MM_URL, bot.token).post('/posts', { channel_id: news, message: text });
  await q('update propium_events set post_id=$2 where event_id=$1', [String(ev.id), post.id]);
  await audit('hub', 'propium', 'news.post', ev.type, { event_id: ev.id, post_id: post.id });
  return { ok: true, post_id: post.id };
}

export const lastNews = (limit = 20) =>
  q(`select event_id, type, received_at, post_id from propium_events order by received_at desc limit $1`, [limit]);

