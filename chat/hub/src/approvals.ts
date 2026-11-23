// Approvals: an agent submits a draft or an action (sensitive email, outreach sequence, transfer...);
// a card lands in #approvals with Approve / Edit / Reject; the decision goes back to the agent.

import { env } from './env.js';
import { q, one } from './db.js';
import { MM } from './mm.js';
import { type Agent, type Human, ToolError, admin, enqueue, audit, newId, sign, getAgent, permalink } from './core.js';
import { channelId, systemBot } from './guard.js';
import { t } from './i18n.js';

type Approval = {
  id: string; agent_key: string; kind: string; title: string; summary: string | null; draft: string | null; payload: any;
  related_label: string | null; related_url: string | null; post_id: string | null; status: string;
  decided_by: string | null; decided_at: Date | null; edited_draft: string | null; comment: string | null; created_at: Date;
};

const getApproval = (id: string) => one<Approval>('select * from approvals where id=$1', [id]);
const deciderLang = async () => (await one<{ lang: string }>('select lang from humans where is_admin order by key limit 1'))?.lang ?? 'en';

async function bot() {
  const b = await systemBot('humanup');
  if (!b) throw new ToolError(500, 'Humanup system bot missing (run the seed)');
  return new MM(env.MM_URL, b.token);
}

function cardProps(a: Approval, agent: Agent, lang: string, decidedBy?: string) {
  const lines: string[] = [];
  lines.push(`**${a.kind}** · ${a.title}`);
  if (a.summary) lines.push(a.summary);
  const draft = a.status === 'edited' && a.edited_draft ? a.edited_draft : a.draft;
  if (draft) lines.push('', '```', draft.replace(/```/g, "'''"), '```');
  if (a.related_label) lines.push(a.related_url ? `[${a.related_label}](${a.related_url})` : a.related_label);
  let color = '#7B61FF';
  let actions: any[] | undefined;
  if (a.status === 'pending') {
    const ctx = (d: string) => ({ kind: 'approval', aid: a.id, d, sig: sign('approval', a.id, d) });
    const url = `${env.HUB_URL_FOR_MM}/mm/actions`;
    actions = [
      { id: 'approve', name: t(lang, 'approve'), type: 'button', style: 'success', integration: { url, context: ctx('approve') } },
      ...(a.draft ? [{ id: 'edit', name: t(lang, 'edit'), type: 'button', style: 'default', integration: { url, context: ctx('edit') } }] : []),
      { id: 'reject', name: t(lang, 'reject'), type: 'button', style: 'danger', integration: { url, context: ctx('reject') } },
    ];
  } else {
    color = a.status === 'rejected' ? '#D24B4E' : '#3DB887';
    const key = a.status === 'rejected' ? 'rejected_by' : a.status === 'edited' ? 'edited_by' : 'approved_by';
    lines.push('', `**${t(lang, key, { person: decidedBy ?? a.decided_by ?? '' })}**${a.comment ? ` · ${a.comment}` : ''}`);
  }
  return { attachments: [{ color, fallback: t(lang, 'approval_title', { agent: agent.name }),
    title: `🔏 ${t(lang, 'approval_title', { agent: agent.name })}`, text: lines.join('\n'), actions }] };
}

export async function requestApproval(agent: Agent, input: {
  kind: string; title: string; summary?: string; draft?: string; payload?: unknown; related?: { label: string; url?: string };
}) {
  const ch = await channelId('approvals');
  if (!ch) throw new ToolError(500, '#approvals not found');
  const id = newId('a');
  await q(`insert into approvals (id, agent_key, kind, title, summary, draft, payload, related_label, related_url)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, agent.key, input.kind, input.title, input.summary ?? null, input.draft ?? null,
      input.payload === undefined ? null : JSON.stringify(input.payload), input.related?.label ?? null, input.related?.url ?? null]);
  const a = (await getApproval(id))!;
  const post = await (await bot()).post('/posts', { channel_id: ch, message: '', props: cardProps(a, agent, await deciderLang()) });
  await q('update approvals set post_id=$2 where id=$1', [id, post.id]);
  await audit('agent', agent.key, 'approval.request', 'approvals', { approval_id: id, kind: input.kind, title: input.title });
  return { approval_id: id, status: 'pending', permalink: permalink(post.id) };
}

export async function approvalStatus(agent: Agent, input: { approval_id: string }) {
  const a = await getApproval(input.approval_id);
  if (!a || a.agent_key !== agent.key) throw new ToolError(404, 'Approval not found');
  return { approval_id: a.id, status: a.status, decided_by: a.decided_by, decided_at: a.decided_at,
    edited_draft: a.edited_draft, comment: a.comment };
}

async function decide(a: Approval, human: Human, decision: 'approved' | 'edited' | 'rejected', edited?: string, comment?: string) {
  const updated = await one<Approval>(
    `update approvals set status=$2, decided_by=$3, decided_at=now(), edited_draft=$4, comment=$5 where id=$1 and status='pending' returning *`,
    [a.id, decision, human.key, edited ?? null, comment?.trim() || null]);
  if (!updated) return null;
  const agent = (await getAgent(a.agent_key))!;
  if (updated.post_id) {
    await (await bot()).put(`/posts/${updated.post_id}/patch`, { props: cardProps(updated, agent, human.lang, human.first_name) });
  }
  await enqueue(agent.key, 'approval', human.key, {
    approval_id: a.id, decision, title: a.title, kind: a.kind, payload: a.payload,
    edited_draft: edited ?? null, comment: comment?.trim() || null, decided_by: human.key,
    text: `${human.first_name} ${decision === 'rejected' ? 'rejected' : decision === 'edited' ? 'approved with edits' : 'approved'}: ${a.title}`,
  });
  await audit('human', human.key, `approval.${decision}`, agent.key, { approval_id: a.id });
  return updated;
}

/** A button on an approval card. Edit and Reject open a dialog; Approve decides at once. */
export async function onApprovalAction(body: any, human: Human) {
  const ctx = body.context;
  if (ctx.sig !== sign('approval', ctx.aid, ctx.d)) return { ephemeral_text: 'Invalid action.' };
  if (!human.is_admin) return { ephemeral_text: t(human.lang, 'admin_only') };
  const a = await getApproval(ctx.aid);
  if (!a || a.status !== 'pending') return { ephemeral_text: t(human.lang, 'already') };
  const agent = (await getAgent(a.agent_key))!;
  if (ctx.d === 'approve') {
    const updated = await decide(a, human, 'approved');
    return updated ? { update: { message: '', props: cardProps(updated, agent, human.lang, human.first_name) } } : {};
  }
  const mode = ctx.d === 'edit' ? 'edit' : 'reject';
  const elements = mode === 'edit'
    ? [
        { display_name: t(human.lang, 'field_draft'), name: 'draft', type: 'textarea', default: a.draft ?? '', max_length: 3000 },
        { display_name: t(human.lang, 'field_comment', { agent: agent.name }), name: 'comment', type: 'textarea', optional: true, max_length: 1000 },
      ]
    : [{ display_name: t(human.lang, 'field_reason'), name: 'comment', type: 'textarea', optional: true, max_length: 1000 }];
  await admin().post('/actions/dialogs/open', {
    trigger_id: body.trigger_id,
    url: `${env.HUB_URL_FOR_MM}/mm/dialog`,
    dialog: {
      callback_id: a.id,
      title: t(human.lang, mode === 'edit' ? 'dialog_edit_title' : 'dialog_reject_title'),
      elements,
      submit_label: t(human.lang, mode === 'edit' ? 'submit_approve' : 'submit_reject'),
      state: JSON.stringify({ aid: a.id, mode, sig: sign('dialog', a.id, mode) }),
    },
  });
  return {};
}

/** Submission of the Edit / Reject dialog. */
export async function onApprovalDialog(body: any, human: Human | null) {
  if (body.cancelled) return {};
  let state: any;
  try { state = JSON.parse(body.state ?? '{}'); } catch { return { error: 'Invalid dialog' }; }
  if (state.sig !== sign('dialog', state.aid, state.mode)) return { error: 'Invalid dialog' };
  if (!human?.is_admin) return { error: 'Only an admin can decide' };
  const a = await getApproval(state.aid);
  if (!a || a.status !== 'pending') return { error: 'Already decided' };
  const s = body.submission ?? {};
  if (state.mode === 'edit') {
    if (!String(s.draft ?? '').trim()) return { errors: { draft: 'Required' } };
    await decide(a, human, s.draft.trim() === (a.draft ?? '').trim() ? 'approved' : 'edited', s.draft, s.comment);
  } else {
    await decide(a, human, 'rejected', undefined, s.comment);
  }
  return {};
}
