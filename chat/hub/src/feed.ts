// Activity feed: one line per event in the agent's domain channel (#d-<domain>), posted by the Humanup bot,
// in Méroë's language. What it shows is registry-level information (questions, answers, decisions),
// never the content of private conversations.

import { env } from './env.js';
import { one } from './db.js';
import { MM } from './mm.js';
import { getAgent } from './core.js';
import { TEAM_TZ, channelId, systemBot } from './guard.js';
import { t, fmtDate } from './i18n.js';

const viewerLang = async () =>
  (await one<{ lang: string }>('select lang from humans where is_admin order by key limit 1'))?.lang ?? 'en';

export async function domainChannel(agentKey: string): Promise<string | null> {
  const agent = await getAgent(agentKey);
  const domain = agent?.rules?.domain as string | undefined;
  return domain && !agent?.hidden ? channelId(`d-${domain}`) : null;
}

/** Posts a feed line for an agent's event. Never throws: the feed must not break the action itself. */
export async function feed(agentKey: string, key: string, vars: Record<string, string | number | Date | null | undefined> = {}) {
  try {
    const [channel, bot, lang] = await Promise.all([domainChannel(agentKey), systemBot('humanup'), viewerLang()]);
    if (!channel || !bot) return;
    // Dates in Méroë's language and the team's time zone; missing values as empty text.
    const v = Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, x instanceof Date ? fmtDate(x, lang, TEAM_TZ) : x ?? '']));
    await new MM(env.MM_URL, bot.token).post('/posts', { channel_id: channel, message: t(lang, key, v) });
  } catch (e: any) {
    console.error(`[feed] ${agentKey} ${key}: ${e.message}`);
  }
}

export const quote = (s: string | null | undefined, max = 140) => {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};
