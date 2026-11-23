// The actions an agent can take. One definition, three doors: REST (/v1/tools/<name>), MCP (/mcp), Claude test adapter.

import { Ajv } from 'ajv';
import { q } from './db.js';
import {
  type Agent, ToolError, takePending, ack, reply, askHuman, resolveQuestion, redirectToAgent,
  asAgent, accessByChannel, getAgent, permalink,
} from './core.js';
import { queryRegistry } from './registry.js';
import { postInOps, postInDomain } from './ops.js';
import { requestApproval, approvalStatus } from './approvals.js';
import { submitReport, scheduleMessage, cancelScheduled } from './scheduler.js';

type Schema = Record<string, unknown>;
export type Tool = {
  name: string;
  description: string;
  input_schema: Schema;
  /** Not offered to the Claude test adapter (it receives events directly). */
  queueOnly?: boolean;
  handler: (agent: Agent, input: any) => Promise<unknown>;
};

const obj = (properties: Record<string, Schema>, required: string[] = []): Schema =>
  ({ type: 'object', properties, required, additionalProperties: false });

export const tools: Tool[] = [
  {
    name: 'get_pending_messages',
    description: 'Get the messages and answers waiting for you (oldest first) and mark them delivered. '
      + 'Each item has event_id, type ("message" or "answer"), from (key, name, lang, timezone), text, post_id. '
      + 'Answers also carry question_id and choice. Write to each person in their lang. Call ack when done.',
    input_schema: obj({ limit: { type: 'integer', minimum: 1, maximum: 100 } }),
    queueOnly: true,
    handler: async (agent, input) => ({ events: await takePending(agent.key, input.limit ?? 50) }),
  },
  {
    name: 'ack',
    description: 'Mark events as handled so they are not delivered again. Replying to a post acks it automatically.',
    input_schema: obj({ event_ids: { type: 'array', items: { type: 'integer' }, minItems: 1 } }, ['event_ids']),
    queueOnly: true,
    handler: async (agent, input) => ({ acked: await ack(agent.key, input.event_ids) }),
  },
  {
    name: 'reply',
    description: 'Write in a conversation. To answer a message, pass reply_to_post_id (the post_id you received). '
      + 'To start a new message to someone, pass to (their key) instead; your rules decide who you may write to.',
    input_schema: obj({
      text: { type: 'string', minLength: 1, maxLength: 16000 },
      reply_to_post_id: { type: 'string' },
      to: { type: 'string', description: 'Person key, e.g. "lea"' },
    }, ['text']),
    handler: (agent, input) => reply(agent, input),
  },
  {
    name: 'ask_human',
    description: 'Ask a person a question. Posts a card in your conversation with them: subject, the Propium object it is about, '
      + 'the question and a deadline. Give 2 to 4 short choices whenever the answer can be closed (e.g. ["Yes","No"]): '
      + 'they answer in one click. Free text answers in the thread also work. You get an "answer" event; '
      + 'then do the work and call resolve_question.',
    input_schema: obj({
      to: { type: 'string', description: 'Person key, e.g. "lea"' },
      subject: { type: 'string', minLength: 1, maxLength: 120 },
      question: { type: 'string', minLength: 1, maxLength: 4000 },
      choices: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 60 }, minItems: 2, maxItems: 4 },
      deadline: { type: 'string', description: 'ISO 8601. Default: in 24 hours' },
      object: obj({
        type: { type: 'string', enum: ['candidate', 'mandate', 'company', 'client', 'other'] },
        id: { type: 'string' },
        label: { type: 'string' },
        url: { type: 'string' },
      }, ['label']),
    }, ['to', 'subject', 'question']),
    handler: (agent, input) => askHuman(agent, input),
  },
  {
    name: 'resolve_question',
    description: 'Close a question once you acted on the answer. confirmation is one line posted in the thread '
      + '(in the person\'s language); propium_action says what you changed in Propium (English), for the registry.',
    input_schema: obj({
      question_id: { type: 'string' },
      confirmation: { type: 'string', maxLength: 1000 },
      propium_action: { type: 'string', maxLength: 1000 },
    }, ['question_id']),
    handler: (agent, input) => resolveQuestion(agent, input),
  },
  {
    name: 'redirect_to_agent',
    description: 'Use when a message is outside your scope. Do not answer it: name the right agent (see list_agents). '
      + 'The person gets one line and a button to forward the message to that agent.',
    input_schema: obj({
      reply_to_post_id: { type: 'string' },
      to_agent: { type: 'string', description: 'Agent key, e.g. "theo"' },
      reason: { type: 'string', maxLength: 300 },
    }, ['reply_to_post_id', 'to_agent']),
    handler: (agent, input) => redirectToAgent(agent, input),
  },
  {
    name: 'get_thread',
    description: 'Read a conversation thread (or a single message and its replies) in one of your conversations.',
    input_schema: obj({ post_id: { type: 'string' } }, ['post_id']),
    handler: async (agent, input) => {
      const mm = asAgent(agent);
      let thread: any;
      try {
        thread = await mm.get(`/posts/${input.post_id}/thread`);
      } catch {
        throw new ToolError(404, 'Post not found');
      }
      const first = thread.posts[thread.order[0]];
      const acc = first ? await accessByChannel(first.channel_id) : null;
      if (!acc || acc.agent_key !== agent.key) throw new ToolError(403, 'Not one of your conversations');
      const posts = Object.values<any>(thread.posts).sort((a, b) => a.create_at - b.create_at);
      return {
        posts: posts.map((p) => ({
          post_id: p.id, from: p.user_id === agent.mm_user_id ? agent.key : acc.human_key,
          text: p.message, created_at: new Date(p.create_at).toISOString(), permalink: permalink(p.id),
        })),
      };
    },
  },
  {
    name: 'post_in_agents_ops',
    description: 'Coordinate with other agents in the private #agents-ops channel (the team does not see it). '
      + 'Mention agents with @key (e.g. @khoa) to hand them the message: they get an "ops" event. '
      + 'To answer an ops message, pass its post_id as reply_to_post_id. More than 6 agent messages in a row '
      + 'without a person are refused (anti-loop).',
    input_schema: obj({
      text: { type: 'string', minLength: 1, maxLength: 8000 },
      reply_to_post_id: { type: 'string' },
    }, ['text']),
    handler: (agent, input) => postInOps(agent, input),
  },
  {
    name: 'post_in_domain',
    description: 'Coordinate with the other agents of your domain in your private domain channel (#d-<domain>), '
      + 'which Méroë follows (the team does not see it). Mention a colleague with @key to hand them the message '
      + '(an "ops" event). Use #agents-ops (post_in_agents_ops) for agents of other domains. Same anti-loop rule.',
    input_schema: obj({
      text: { type: 'string', minLength: 1, maxLength: 8000 },
      reply_to_post_id: { type: 'string' },
    }, ['text']),
    handler: (agent, input) => postInDomain(agent, input),
  },
  {
    name: 'request_approval',
    description: 'Ask Méroë to approve something before you do it (sensitive email, outreach sequence, transfer...). '
      + 'A card lands in #approvals with Approve / Edit / Reject. Do not act until you get the "approval" event: '
      + 'decision is approved, edited (use edited_draft instead of your draft) or rejected (see comment).',
    input_schema: obj({
      kind: { type: 'string', enum: ['email', 'sequence', 'transfer', 'other'] },
      title: { type: 'string', minLength: 1, maxLength: 200 },
      summary: { type: 'string', maxLength: 2000 },
      draft: { type: 'string', maxLength: 3000, description: 'The text to approve, editable by Méroë' },
      payload: { type: 'object', description: 'Details you need back (amount, recipients...)' },
      related: obj({ label: { type: 'string' }, url: { type: 'string' } }, ['label']),
    }, ['kind', 'title']),
    handler: (agent, input) => requestApproval(agent, input),
  },
  {
    name: 'get_approval_status',
    description: 'Status of one of your approval requests.',
    input_schema: obj({ approval_id: { type: 'string' } }, ['approval_id']),
    handler: (agent, input) => approvalStatus(agent, input),
  },
  {
    name: 'post_report',
    description: 'Hand over your scheduled channel report (Maya: the daily report in #performance). '
      + 'It is published at the scheduled time, or at once if that time has passed. One per day.',
    input_schema: obj({ text: { type: 'string', minLength: 1, maxLength: 16000 } }, ['text']),
    handler: (agent, input) => submitReport(agent, input),
  },
  {
    name: 'schedule_message',
    description: 'Send a message to a person later (ISO time). Your rules are checked when it is sent.',
    input_schema: obj({
      to: { type: 'string' }, text: { type: 'string', minLength: 1, maxLength: 16000 }, send_at: { type: 'string' },
    }, ['to', 'text', 'send_at']),
    handler: (agent, input) => scheduleMessage(agent, input),
  },
  {
    name: 'cancel_scheduled_message',
    description: 'Cancel one of your scheduled messages that is not sent yet.',
    input_schema: obj({ scheduled_id: { type: 'string' } }, ['scheduled_id']),
    handler: (agent, input) => cancelScheduled(agent, input),
  },
  {
    name: 'list_agents',
    description: 'Directory of the agents: key, name, what they do, scope, who they report to.',
    input_schema: obj({}),
    handler: async () => ({
      agents: (await q<any>(`select key, name, title, scope, rules->>'reports_to' as reports_to from agents
                             where not hidden order by name`)),
    }),
  },
  {
    name: 'list_my_questions',
    description: 'Your questions, newest first, optionally filtered by status (open, answered, resolved).',
    input_schema: obj({ status: { type: 'string', enum: ['open', 'answered', 'resolved', 'cancelled', 'expired', 'escalated'] } }),
    handler: async (agent, input) => ({
      questions: await q(`select id, human_key as to, subject, status, deadline, answer_choice, answer_text, created_at
                          from questions where agent_key=$1 and ($2::text is null or status=$2)
                          order by created_at desc limit 100`, [agent.key, input.status ?? null]),
    }),
  },
  {
    name: 'query_registry',
    description: 'Registry of every question agents asked people (only for agents allowed to read it).',
    input_schema: obj({
      agent: { type: 'string' }, human: { type: 'string' },
      status: { type: 'string' }, since: { type: 'string' }, until: { type: 'string' },
    }),
    handler: async (agent, input) => {
      if (!agent.rules.registry_reader) throw new ToolError(403, 'You are not allowed to read the registry');
      return { questions: await queryRegistry({ ...input, includeConfidential: false }) };
    },
  },
];

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map(tools.map((t) => [t.name, ajv.compile(t.input_schema)]));

export async function runTool(agent: Agent, name: string, input: unknown) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new ToolError(404, `Unknown tool "${name}"`);
  if (agent.status !== 'active') throw new ToolError(423, 'You are paused');
  const args = input ?? {};
  const validate = validators.get(name)!;
  if (!validate(args)) throw new ToolError(400, ajv.errorsText(validate.errors));
  return tool.handler(agent, args);
}

export { getAgent };
