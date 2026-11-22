// Registry of the questions agents ask people: who, what, when, answered or not, how fast, what was done in Propium.

import { q } from './db.js';

export type RegistryFilter = {
  agent?: string; human?: string; status?: string; since?: string; until?: string; includeConfidential: boolean;
};

export async function queryRegistry(f: RegistryFilter) {
  return q(
    `select q.id, q.agent_key as agent, a.name as agent_name, q.human_key as asked_to, h.name as asked_to_name,
            q.subject, q.object_type, q.object_label, q.object_url, q.body as question, q.choices,
            q.created_at as asked_at, q.deadline, q.status, q.answer_choice, q.answer_text, q.answered_via, q.answered_at,
            case when q.answered_at is not null then round(extract(epoch from q.answered_at - q.created_at) / 60) end as response_minutes,
            q.resolution, q.propium_action, q.resolved_at
       from questions q join agents a on a.key=q.agent_key join humans h on h.key=q.human_key
      where ($1::text is null or q.agent_key=$1) and ($2::text is null or q.human_key=$2)
        and ($3::text is null or q.status=$3)
        and ($4::timestamptz is null or q.created_at >= $4) and ($5::timestamptz is null or q.created_at < $5)
        and ($6 or not q.confidential)
      order by q.created_at desc limit 5000`,
    [f.agent ?? null, f.human ?? null, f.status ?? null, f.since ?? null, f.until ?? null, f.includeConfidential],
  );
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}
