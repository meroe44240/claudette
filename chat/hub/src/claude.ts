// Test adapter: plays an agent with the Claude API, so every flow can be tested without Grok Bot.
// Enabled per agent with delivery_mode "claude-test" in agents.secrets.json. Needs ANTHROPIC_API_KEY.

import Anthropic from '@anthropic-ai/sdk';
import { env } from './env.js';
import { q } from './db.js';
import { type Agent, type PendingEvent, takePending, ack, asAgent, dmChannel, ToolError, audit } from './core.js';
import { tools, runTool } from './tools.js';

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

const ACTING_TOOLS = new Set(['reply', 'ask_human', 'redirect_to_agent', 'resolve_question']);

async function systemPrompt(agent: Agent) {
  const directory = await q<{ key: string; name: string; title: string; scope: string }>(
    'select key, name, title, scope from agents where not hidden and key <> $1 order by name', [agent.key]);
  return [
    `You are ${agent.name}, an AI agent at Humanup, an executive search firm whose team works in Ho Chi Minh City.`,
    `What you do: ${agent.title}.`,
    `Your scope: ${agent.scope}.`,
    '',
    'You talk with people in private conversations through tools. Each event you receive is a message or an answer from one person.',
    '- Answer only what is inside your scope. If a message is outside it, do not answer the substance: call redirect_to_agent '
      + 'with the right agent from the directory below and post nothing else.',
    '- Write to each person in their language (the "lang" field: fr = French, en = English). Keep it short and plain.',
    '- To answer a message, call reply with reply_to_post_id set to the event\'s post_id.',
    '- When you need information from a person, call ask_human; give 2 to 4 short choices when the answer can be closed.',
    '- When you get an answer event, act on it, then call resolve_question with a one-line confirmation in the person\'s '
      + 'language and propium_action in English.',
    '- This is a test environment: you cannot reach Propium. When an action in Propium is needed, describe it in propium_action.',
    '',
    'Directory of the other agents (key: name, what they do, scope):',
    ...directory.map((d) => `- ${d.key}: ${d.name}, ${d.title}. Scope: ${d.scope}`),
  ].join('\n');
}

async function recentConversation(agent: Agent, event: PendingEvent) {
  const from = event.from as { key: string } | undefined;
  if (!from) return '';
  const channel = await dmChannel(agent.key, from.key);
  if (!channel) return '';
  const res = await asAgent(agent).get(`/channels/${channel}/posts?per_page=12`);
  const posts = (res.order as string[]).map((id) => res.posts[id]).reverse();
  return posts.map((p: any) => `${p.user_id === agent.mm_user_id ? agent.name : from.key} (${p.id}): ${p.message || '[card]'}`).join('\n');
}

const claudeTools: Anthropic.Beta.BetaTool[] = tools
  .filter((t) => !t.queueOnly && t.name !== 'query_registry')
  .map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema }));

export async function runClaudeAgent(agent: Agent) {
  if (!process.env.ANTHROPIC_API_KEY) return;
  const events = await takePending(agent.key, 10);
  for (const event of events) {
    try {
      await handleEvent(agent, event);
    } catch (e: any) {
      console.error(`[claude-test] ${agent.key} event ${event.event_id}`, e);
      await audit('hub', 'claude-test', 'error', agent.key, { event_id: event.event_id, error: e.message });
    }
    await ack(agent.key, [event.event_id]);
  }
}

async function handleEvent(agent: Agent, event: PendingEvent) {
  const system = await systemPrompt(agent);
  const history = await recentConversation(agent, event);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: 'user',
    content: `New event:\n\`\`\`json\n${JSON.stringify(event, null, 2)}\n\`\`\`\n\nRecent conversation with this person (oldest first):\n${history || '(none)'}`,
  }];
  let acted = false;
  let lastText = '';
  for (let turn = 0; turn < 6; turn++) {
    // Server-side fallback: if a safety classifier declines, the API retries on a fallback model in the same call.
    const response = await getClient().beta.messages.create({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      model: env.CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      system,
      tools: claudeTools,
      messages,
    });
    if (response.stop_reason === 'refusal') {
      await audit('hub', 'claude-test', 'refusal', agent.key, { event_id: event.event_id });
      return;
    }
    messages.push({ role: 'assistant', content: response.content });
    lastText = response.content.filter((b) => b.type === 'text').map((b) => (b as Anthropic.Beta.BetaTextBlock).text).join('\n').trim();
    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (!calls.length) break;
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      try {
        const out = await runTool(agent, call.name, call.input);
        if (ACTING_TOOLS.has(call.name)) acted = true;
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out) });
      } catch (e: any) {
        const msg = e instanceof ToolError ? e.message : `Internal error: ${e.message}`;
        results.push({ type: 'tool_result', tool_use_id: call.id, content: msg, is_error: true });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  // A plain text answer with no tool call: post it as the reply.
  if (!acted && lastText && typeof event.post_id === 'string') {
    await runTool(agent, 'reply', { text: lastText, reply_to_post_id: event.post_id });
  }
}
