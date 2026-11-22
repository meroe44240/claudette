// What the Mattermost plugin enforces inside Mattermost, before a post lands:
// read-only channels, no bots in #general, paused agents silent.

import { q } from './db.js';
import { channelId, systemBot } from './guard.js';

export async function buildPolicy() {
  const agents = await q<{ key: string; mm_user_id: string; status: string; rules: any }>(
    'select key, mm_user_id, status, rules from agents');
  const humanup = await systemBot('humanup');
  const propium = await systemBot('propium');
  const sys = [humanup?.user_id, propium?.user_id].filter(Boolean) as string[];
  const [news, performance, general] = await Promise.all([channelId('news'), channelId('performance'), channelId('town-square')]);
  const reporters = agents.filter((a) => a.rules?.report?.channel === 'performance').map((a) => a.mm_user_id);

  const readOnly: Record<string, string[]> = {};
  if (news) readOnly[news] = [propium?.user_id, humanup?.user_id].filter(Boolean) as string[];
  if (performance) readOnly[performance] = [humanup?.user_id, ...reporters].filter(Boolean) as string[];
  return {
    read_only: readOnly,
    no_bots: general ? [general] : [],
    bots: [...agents.map((a) => a.mm_user_id), ...sys],
    paused_bots: agents.filter((a) => a.status !== 'active').map((a) => a.mm_user_id),
    messages: {
      read_only: 'This channel only shows automatic posts. Write in #general, or to an agent in your conversation with it.',
      no_bots: 'Agents do not post in #general.',
      paused: 'This agent is paused.',
    },
    generated_at: new Date().toISOString(),
  };
}
