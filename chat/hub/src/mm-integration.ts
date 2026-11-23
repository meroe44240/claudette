// What Mattermost calls: message buttons (/mm/actions) and slash commands (/mm/command).

import { env } from './env.js';
import { q, one } from './db.js';
import {
  admin, sign, humanByMmId, getQuestion, getAgent, getHuman, answerQuestion, questionProps,
  forwardRedirect, permalink, ToolError, audit,
} from './core.js';
import { t, fmtDate } from './i18n.js';
import { setPaused, sentToday } from './guard.js';

const COMMANDS = [
  { trigger: 'inbox', description: 'Your open questions from every agent, by deadline', hint: '' },
  { trigger: 'agents', description: 'Who does what among the agents (admins: pause / resume)', hint: '[pause|resume <name|all>]' },
];

/** Creates (or points to the Hub) the slash commands in each team. Tokens are kept to check the calls. */
export async function ensureSlashCommands() {
  const mm = admin();
  const url = `${env.HUB_URL_FOR_MM}/mm/command`;
  const tokens: string[] = [];
  for (const teamName of [env.MM_TEAM, 'private']) {
    const team = await mm.find(`/teams/name/${teamName}`);
    if (!team) continue;
    const existing: any[] = await mm.get(`/commands?team_id=${team.id}&custom_only=true`);
    for (const c of COMMANDS) {
      let cmd = existing.find((e) => e.trigger === c.trigger);
      const spec = {
        team_id: team.id, trigger: c.trigger, method: 'P', url, auto_complete: true,
        auto_complete_desc: c.description, auto_complete_hint: c.hint, display_name: c.trigger, description: c.description,
        username: 'humanup',
      };
      if (!cmd) cmd = await mm.post('/commands', spec);
      else if (cmd.url !== url || cmd.auto_complete_hint !== spec.auto_complete_hint || cmd.auto_complete_desc !== spec.auto_complete_desc) {
        cmd = await mm.put(`/commands/${cmd.id}`, { ...cmd, ...spec });
      }
      tokens.push(cmd.token);
    }
  }
  await q(`insert into kv (key, value) values ('slash_tokens', $1) on conflict (key) do update set value=$1`, [JSON.stringify(tokens)]);
}

// ── Buttons ──────────────────────────────────────────────────────────────────

export async function handleAction(body: any) {
  const ctx = body?.context ?? {};
  const human = body?.user_id ? await humanByMmId(body.user_id) : null;
  const lang = human?.lang ?? 'en';
  if (!human) return { ephemeral_text: t(lang, 'not_yours') };

  if (ctx.kind === 'answer') {
    if (ctx.sig !== sign('answer', ctx.qid, String(ctx.i))) return { ephemeral_text: 'Invalid action.' };
    const qn = await getQuestion(ctx.qid);
    if (!qn || qn.human_key !== human.key) return { ephemeral_text: t(lang, 'not_yours') };
    if (qn.status !== 'open') return { ephemeral_text: t(lang, 'already') };
    const choice = qn.choices?.[Number(ctx.i)];
    if (!choice) return { ephemeral_text: 'Invalid action.' };
    const updated = await answerQuestion(qn, human, { choice, via: 'button' });
    if (!updated) return { ephemeral_text: t(lang, 'already') };
    const agent = (await getAgent(qn.agent_key))!;
    const post = body.post_id ? await admin().get(`/posts/${body.post_id}`).catch(() => null) : null;
    return { update: { message: post?.message ?? '', props: questionProps(updated, agent, human) } };
  }

  if (ctx.kind === 'forward') {
    if (ctx.sig !== sign('forward', ctx.rid)) return { ephemeral_text: 'Invalid action.' };
    try {
      const { target } = await forwardRedirect(ctx.rid, human);
      const post = body.post_id ? await admin().get(`/posts/${body.post_id}`).catch(() => null) : null;
      return { update: { message: `${post?.message ?? ''}\n✅ ${t(lang, 'forwarded', { agent: target.name })}`, props: {} } };
    } catch (e) {
      if (e instanceof ToolError) return { ephemeral_text: t(lang, 'not_yours') };
      throw e;
    }
  }
  return { ephemeral_text: 'Unknown action.' };
}

// ── Slash commands ───────────────────────────────────────────────────────────

export async function handleCommand(form: Record<string, string>) {
  const tokens = (await one<{ value: string[] }>(`select value from kv where key='slash_tokens'`))?.value ?? [];
  if (!form.token || !tokens.includes(form.token)) return { status: 401, body: { text: 'Unauthorized' } };
  const human = await humanByMmId(form.user_id);
  if (!human) return { status: 200, body: { response_type: 'ephemeral', text: 'Humanup Chat does not know you yet.' } };
  const lang = human.lang;
  const cmd = (form.command ?? '').replace(/^\//, '');
  await audit('human', human.key, `command.${cmd}`, undefined, { text: form.text });

  if (cmd === 'inbox') {
    const rows = await q<any>(
      `select q.id, q.subject, q.deadline, q.root_post_id, a.name as agent_name
         from questions q join agents a on a.key=q.agent_key
        where q.human_key=$1 and q.status='open'
        order by q.deadline asc nulls last, q.created_at asc`, [human.key]);
    if (!rows.length) return ok(t(lang, 'inbox_empty'));
    const lines = rows.map((r) => {
      const late = r.deadline && new Date(r.deadline).getTime() < Date.now();
      const due = r.deadline ? fmtDate(new Date(r.deadline), lang, human.timezone) : t(lang, 'no_deadline');
      const subject = r.root_post_id ? `[${r.subject.replace(/[|\]]/g, ' ')}](${permalink(r.root_post_id)})` : r.subject;
      return `| ${late ? '⚠️ ' : ''}${due} | ${r.agent_name} | ${subject} |`;
    });
    return ok([`**${t(lang, 'inbox_title', { n: rows.length })}**`, '',
      `| ${t(lang, 'col_due')} | ${t(lang, 'col_agent')} | ${t(lang, 'col_question')} |`, '|---|---|---|', ...lines].join('\n'));
  }

  if (cmd === 'agents') {
    const [sub, ...args] = (form.text ?? '').trim().split(/\s+/).filter(Boolean);
    if (sub === 'pause' || sub === 'resume') {
      if (!human.is_admin) return ok(t(lang, 'admin_only'));
      const target = (args[0] ?? '').toLowerCase().replace(/^@/, '');
      let keys: string[] | 'all' = 'all';
      if (target !== 'all') {
        // "theo", "Théo" and "@theo" all work.
        const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const a = (await q<{ key: string; name: string }>('select key, name from agents'))
          .find((x) => x.key === target || plain(x.name) === plain(target));
        if (!a) return ok(t(lang, 'no_agent', { name: target || '?' }));
        keys = [a.key];
      }
      const done = await setPaused(keys, sub === 'pause', human.key);
      return ok(t(lang, sub === 'pause' ? 'paused_done' : 'resumed_done', { names: done.map((d) => d.name).join(', ') || '-' }));
    }
    if (human.is_admin) {
      // Admin view: status and today's counters.
      const all = await q<any>(
        `select a.key, a.name, a.status, coalesce((a.rules->>'daily_message_budget')::int, 200) as budget,
                (select count(*) from questions qq where qq.agent_key=a.key and qq.status='open') as open_q
           from agents a order by a.name`);
      const lines = [];
      for (const r of all) {
        const sent = await sentToday(r.key);
        lines.push(`| ${r.name} | ${r.status === 'active' ? t(lang, 'st_active') : `⏸ ${t(lang, 'st_paused')}`} | ${sent} / ${r.budget} | ${r.open_q} |`);
      }
      return ok([`**${t(lang, 'agents_title')} (${all.length})**`, '',
        `| ${t(lang, 'col_agent')} | ${t(lang, 'col_status')} | ${t(lang, 'col_today')} | ${t(lang, 'col_open')} |`, '|---|---|---|---|',
        ...lines, '', '`/agents pause <name|all>` · `/agents resume <name|all>`'].join('\n'));
    }
    const rows = await q<any>(
      `select a.name, a.title, a.rules->>'reports_to' as reports_to
         from agents a join access x on x.agent_key=a.key and x.human_key=$1
        order by a.name`, [human.key]);
    const names = new Map((await q<any>('select key, name from agents union all select key, first_name as name from humans'))
      .map((r) => [r.key, r.name]));
    return ok([`**${t(lang, 'agents_title')} (${rows.length})**`, '',
      `| ${t(lang, 'col_agent')} | ${t(lang, 'col_does')} | ${t(lang, 'col_reports')} |`, '|---|---|---|',
      ...rows.map((r) => `| ${r.name} | ${r.title} | ${r.reports_to ? names.get(r.reports_to) ?? r.reports_to : ''} |`)].join('\n'));
  }
  return ok(t(lang, 'unknown_command'));
}

const ok = (text: string) => ({ status: 200, body: { response_type: 'ephemeral', text } });

export { getHuman };
