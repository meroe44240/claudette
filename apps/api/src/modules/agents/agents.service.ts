import { randomBytes } from 'crypto';
import prisma from '../../lib/db.js';
import { hashPassword } from '../../lib/password.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { forgetUserLabel } from '../../lib/audit-trash.js';
import { generateAgentKey } from './agent-keys.js';
import { invalidateAgentLimit } from './rate-limit.js';

/** Équipe d'agents prévue au lancement (créés d'un clic depuis la page Agents). */
export const DEFAULT_AGENTS = [
  'Inès', 'Karim', 'Linh', 'Khoa', 'Maya', 'Yasmine', 'Bastien', 'Diego', 'Lucas', 'Ethan', 'Nathan', 'Amara',
  'Tom', 'Yanis', 'Victor', 'Leïla', 'Hugo', 'Iris', 'Antoine', 'Awa', 'Théo', 'Clara', 'Margaux',
];

/** Nom de famille des comptes agents : partout où l'auteur s'affiche, on lit « Tom (agent) ». */
export const AGENT_SURNAME = '(agent)';

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function startOfToday() {
  const d = new Date();
  // Minuit à Paris, sans dépendance : décalage du fuseau à cet instant.
  const paris = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const offset = paris.getTime() - d.getTime();
  const p = new Date(paris); p.setHours(0, 0, 0, 0);
  return new Date(p.getTime() - offset);
}

const agentSelect = {
  id: true, prenom: true, nom: true, email: true, status: true, createdAt: true,
  apiKeyPrefix: true, apiKeyCreatedAt: true, limiteParMinute: true,
} as const;

export async function listAgents() {
  const agents = await prisma.user.findMany({ where: { estAgent: true }, select: agentSelect, orderBy: { prenom: 'asc' } });
  const ids = agents.map((a) => a.id);
  const since7 = new Date(startOfToday().getTime() - 6 * 86_400_000);
  const latest = (...d: Array<Date | null | undefined>) => d.filter(Boolean).sort((x, y) => y!.getTime() - x!.getTime())[0] ?? null;
  const [today, last, writes, perDay, lastWrite] = await Promise.all([
    prisma.mcpActionLog.groupBy({ by: ['userId'], where: { userId: { in: ids }, createdAt: { gte: startOfToday() } }, _count: { _all: true } }),
    prisma.mcpActionLog.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _max: { createdAt: true } }),
    prisma.auditLog.groupBy({ by: ['userId'], where: { userId: { in: ids }, createdAt: { gte: startOfToday() } }, _count: { _all: true } }),
    ids.length
      ? prisma.$queryRaw<Array<{ user_id: string; day: string; n: bigint }>>`
          SELECT "userId" AS user_id, to_char(("createdAt" AT TIME ZONE 'Europe/Paris')::date, 'YYYY-MM-DD') AS day, count(*) AS n
          FROM mcp_action_logs WHERE "userId" = ANY(${ids}::uuid[]) AND "createdAt" >= ${since7}
          GROUP BY 1, 2`
      : Promise.resolve([]),
    prisma.auditLog.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) days.push(new Date(Date.now() - i * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }));
  const count = (rows: Array<{ userId: string; _count: { _all: number } }>, id: string) => rows.find((r) => r.userId === id)?._count._all ?? 0;
  return agents.map((a) => ({
    id: a.id,
    name: a.prenom ?? a.nom,
    email: a.email,
    status: a.status,
    created_at: a.createdAt,
    key: a.apiKeyPrefix ? { prefix: a.apiKeyPrefix, created_at: a.apiKeyCreatedAt } : null,
    rate_limit_per_minute: a.limiteParMinute,
    last_activity_at: latest(last.find((r) => r.userId === a.id)?._max.createdAt, lastWrite.find((r) => r.userId === a.id)?._max.createdAt),
    actions_today: count(today as any, a.id),
    writes_today: count(writes as any, a.id),
    actions_7_days: days.map((day) => ({ day, count: Number(perDay.find((r) => r.user_id === a.id && r.day === day)?.n ?? 0) })),
  }));
}

async function getAgent(id: string) {
  const a = await prisma.user.findFirst({ where: { id, estAgent: true }, select: agentSelect });
  if (!a) throw new NotFoundError('Agent', id);
  return a;
}

/** Crée un agent et renvoie sa clé. La clé n'est montrée qu'à ce moment-là. */
export async function createAgent(name: string) {
  const prenom = name.trim();
  if (!prenom || prenom.length > 60) throw new ValidationError('Nom d\'agent invalide (1 à 60 caractères).');
  const existing = await prisma.user.findFirst({ where: { estAgent: true, prenom: { equals: prenom, mode: 'insensitive' } } });
  if (existing) throw new ValidationError(`Un agent nommé ${prenom} existe déjà.`);
  let email = `${slug(prenom) || 'agent'}@agents.propium.co`;
  for (let i = 2; await prisma.user.findUnique({ where: { email } }); i++) email = `${slug(prenom)}-${i}@agents.propium.co`;
  const { key, hash, prefix } = generateAgentKey();
  const user = await prisma.user.create({
    data: {
      email,
      prenom,
      nom: AGENT_SURNAME,
      // Mot de passe aléatoire jamais communiqué : un agent ne se connecte pas à l'interface.
      passwordHash: await hashPassword(randomBytes(32).toString('hex')),
      role: 'MANAGER',
      estAgent: true,
      mustChangePassword: false,
      excludeFromTeamStats: true,
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      apiKeyCreatedAt: new Date(),
    },
    select: agentSelect,
  });
  return { agent: user, key };
}

/** Crée d'un coup les agents de la liste qui n'existent pas encore. */
export async function createMissingAgents() {
  const existing = await prisma.user.findMany({ where: { estAgent: true }, select: { prenom: true } });
  const have = new Set(existing.map((e) => slug(e.prenom ?? '')));
  const created: Array<{ name: string; id: string; key: string }> = [];
  for (const name of DEFAULT_AGENTS) {
    if (have.has(slug(name))) continue;
    const r = await createAgent(name);
    created.push({ name, id: r.agent.id, key: r.key });
  }
  return { created, already_existing: DEFAULT_AGENTS.length - created.length };
}

/** Nouvelle clé : l'ancienne cesse de marcher immédiatement. */
export async function rotateKey(id: string) {
  await getAgent(id);
  const { key, hash, prefix } = generateAgentKey();
  await prisma.user.update({ where: { id }, data: { apiKeyHash: hash, apiKeyPrefix: prefix, apiKeyCreatedAt: new Date(), apiKey: null } });
  return { key, prefix };
}

export async function revokeKey(id: string) {
  await getAgent(id);
  await prisma.user.update({ where: { id }, data: { apiKeyHash: null, apiKeyPrefix: null, apiKeyCreatedAt: null, apiKey: null } });
  return { revoked: true };
}

export async function setStatus(id: string, suspended: boolean) {
  await getAgent(id);
  await prisma.user.update({ where: { id }, data: { status: suspended ? 'SUSPENDED' : 'ACTIVE' } });
  invalidateAgentLimit(id);
  return { status: suspended ? 'SUSPENDED' : 'ACTIVE' };
}

export async function updateAgent(id: string, data: { name?: string; rate_limit_per_minute?: number }) {
  await getAgent(id);
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.prenom = data.name.trim();
  if (data.rate_limit_per_minute !== undefined) patch.limiteParMinute = data.rate_limit_per_minute;
  await prisma.user.update({ where: { id }, data: patch });
  forgetUserLabel(id);
  invalidateAgentLimit(id);
  return getAgent(id);
}
