import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';
import { detectDuplicates } from '../../candidats/duplicate.service.js';
import * as merge from '../../merge/merge.service.js';
import { stageEn } from '../labels.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const mergeArgs = {
  primary_id: z.string().describe('UUID of the record to KEEP (primary)'),
  duplicate_id: z.string().describe('UUID of the duplicate, folded into the primary then deleted'),
  confirm: z.boolean().optional().describe(
    'false or missing = preview only, nothing changes. true = real merge, only after the user explicitly approved the preview.',
  ),
};

// Le service de fusion renvoie des cles en francais : on les traduit pour la reponse MCP.
const KEY_EN: Record<string, string> = {
  principal: 'primary',
  doublon: 'duplicate',
  nom: 'name',
  site: 'website',
  mandat: 'mandate',
  mandats: 'mandates',
  entreprise: 'company',
  etape: 'stage',
  etape_principal: 'stage_primary',
  etape_doublon: 'stage_duplicate',
  etape_gardee: 'stage_kept',
  candidatures_deplacees: 'candidatures_moved',
  candidatures_en_conflit: 'candidatures_in_conflict',
  champs_completes: 'fields_filled',
  tags_ajoutes: 'tags_added',
  mandats_deplaces: 'mandates_moved',
  acces_portail_deplaces: 'portal_accesses_moved',
  contacts_deplaces: 'contacts_moved',
  attention: 'warning',
  primaryId: 'primary_id',
  candidaturesDeplacees: 'candidatures_moved',
  candidaturesFusionnees: 'candidatures_merged',
  activitesRattachees: 'activities_moved',
  mandatsDeplaces: 'mandates_moved',
  accesPortailDeplaces: 'portal_accesses_moved',
  contactsDeplaces: 'contacts_moved',
};

function warningEn(w: string): string {
  let m = w.match(/^Les deux contacts ne sont pas dans la même entreprise \((.*) \/ (.*)\)/);
  if (m) return `The two contacts are not in the same company (${m[1]} / ${m[2]}). The primary contact's company is kept.`;
  m = w.match(/^SIREN différents \((.*) \/ (.*)\)/);
  if (m) return `Different SIREN numbers (${m[1]} / ${m[2]}): these may be two separate companies.`;
  return w;
}

function toEnglish(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(toEnglish);
  if (!v || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const key = KEY_EN[k] ?? k;
    if (val === undefined) continue;
    if (key === 'warning' && typeof val === 'string') out[key] = warningEn(val);
    else out[key] = toEnglish(val);
    if (key.startsWith('stage') && typeof val === 'string') out[`${key}_label`] = stageEn(val);
  }
  return out;
}

const ENTITY_EN: Record<string, string> = { candidat: 'candidate', client: 'client contact', entreprise: 'company' };

function mergeErrorEn(err: merge.MergeError, entite: string): string {
  if (err.code === 'same_id') return 'Both IDs point to the same record.';
  if (err.code === 'not_found') {
    const id = err.message.match(/\(([^)]+)\)/)?.[1] ?? '';
    const which = /doublon/.test(err.message) ? 'Duplicate' : 'Primary';
    return `${which} ${ENTITY_EN[entite]} not found${id ? ` (${id})` : ''}.`;
  }
  return err.message;
}

type Preview = (p: string, d: string) => Promise<unknown>;
type Run = (p: string, d: string, userId?: string) => Promise<unknown>;

function mergeHandler(entite: string, preview: Preview, run: Run) {
  return async (args: Record<string, unknown>, user: { userId: string }) => {
    const primaryId = String(args.primary_id ?? '').trim();
    const duplicateId = String(args.duplicate_id ?? '').trim();
    if (!UUID_RE.test(primaryId) || !UUID_RE.test(duplicateId)) {
      return { error: 'invalid_id', message: `primary_id and duplicate_id must be ${ENTITY_EN[entite]} UUIDs. Use find_duplicates or a search tool to find them.` };
    }
    try {
      if (args.confirm !== true) {
        return {
          preview: true,
          ...(toEnglish(await preview(primaryId, duplicateId)) as object),
          message: 'Preview only, nothing has changed. Show it to the user and, if they approve, call again with confirm=true. The merge is final: the duplicate is deleted.',
        };
      }
      const result = await run(primaryId, duplicateId, user.userId);
      return { success: true, ...(toEnglish(result) as object), message: `Merge done: the duplicate was folded into record ${primaryId}.` };
    } catch (err) {
      if (err instanceof merge.MergeError) return { error: err.code, message: mergeErrorEn(err, entite) };
      throw err;
    }
  };
}

export function registerMergeTools(server: McpServer) {
  // ─── find_duplicates ──────────────────────────────────
  server.tool(
    'find_duplicates',
    "Lists likely duplicates. Candidates: same email or same LinkedIn. Client contacts: same email. Companies: same name or same domain. " +
      'The first record of each group is the oldest one, usually the one to keep. Candidates are open to everyone; client contacts and companies are for admins.',
    {
      entity: z.enum(['candidat', 'client', 'entreprise']).describe('Record type: candidat (candidate), client (client contact), entreprise (company)'),
    },
    wrapTool('find_duplicates', async (args) => {
      if (args.entity === 'candidat') {
        const { groups } = await detectDuplicates();
        const en = groups.map((g) => ({
          primary: g.primary,
          duplicates: g.duplicates.map((d) => ({
            ...d,
            matchReason: d.matchReason.replace(/^Email identique:/, 'Same email:').replace(/^LinkedIn identique/, 'Same LinkedIn'),
          })),
        }));
        return { entity: 'candidat', count: en.length, groups: en };
      }

      if (args.entity === 'client') {
        const rows = await prisma.$queryRaw<Array<{ email: string }>>`
          SELECT lower(email) AS email FROM "clients"
          WHERE email IS NOT NULL AND email != ''
          GROUP BY lower(email) HAVING COUNT(*) > 1 LIMIT 50`;
        const groups = [];
        for (const r of rows) {
          const clients = await prisma.client.findMany({
            where: { email: { equals: r.email, mode: 'insensitive' } },
            select: { id: true, nom: true, prenom: true, email: true, entreprise: { select: { nom: true } }, _count: { select: { mandats: true } } },
            orderBy: { createdAt: 'asc' },
          });
          if (clients.length > 1) groups.push({ reason: `Same email: ${r.email}`, records: clients });
        }
        return { entity: 'client', count: groups.length, groups };
      }

      const rows = await prisma.$queryRaw<Array<{ cle: string; ids: string[] }>>`
        SELECT cle, array_agg(id::text) AS ids FROM (
          SELECT id, 'nom:' || lower(trim(nom)) AS cle FROM "entreprises"
          UNION
          SELECT id, 'domaine:' || lower(trim(domaine)) FROM "entreprises" WHERE domaine IS NOT NULL AND domaine != ''
        ) t GROUP BY cle HAVING COUNT(DISTINCT id) > 1 LIMIT 50`;
      const seen = new Set<string>();
      const groups = [];
      for (const r of rows) {
        const key = [...r.ids].sort().join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const entreprises = await prisma.entreprise.findMany({
          where: { id: { in: r.ids } },
          select: { id: true, nom: true, domaine: true, siteWeb: true, siren: true, _count: { select: { clients: true, mandats: true } } },
          orderBy: { createdAt: 'asc' },
        });
        const [type, valeur] = [r.cle.split(':')[0], r.cle.slice(r.cle.indexOf(':') + 1)];
        groups.push({ reason: `Same ${type === 'nom' ? 'name' : 'domain'}: ${valeur}`, records: entreprises });
      }
      return { entity: 'entreprise', count: groups.length, groups };
    }),
  );

  // ─── merge_candidates ─────────────────────────────────
  server.tool(
    'merge_candidates',
    "[CONFIRMATION REQUIRED] Merges two duplicate candidate records (open to all recruiters). The primary record is kept: it takes over the candidatures, " +
      'history, notes and calls, and fills its empty fields from the duplicate, which is then deleted. ' +
      'If both are on the same mandate, the most advanced candidature is kept. First call WITHOUT confirm to get the preview, ' +
      'show it to the user, then call again with confirm=true only if they approve.',
    mergeArgs,
    wrapTool('merge_candidates', mergeHandler('candidat', merge.previewMergeCandidats, merge.mergeCandidats)),
  );

  // ─── merge_clients ────────────────────────────────────
  server.tool(
    'merge_clients',
    "[CONFIRMATION REQUIRED] Merges two duplicate client contact records (admins only). The primary record is kept: it takes over the mandates, " +
      'portal accesses, leads and history, and fills its empty fields; the duplicate is then deleted. ' +
      'First call WITHOUT confirm for the preview, then with confirm=true once the user approves.',
    mergeArgs,
    wrapTool('merge_clients', mergeHandler('client', merge.previewMergeClients, merge.mergeClients)),
  );

  // ─── merge_companies ──────────────────────────────────
  server.tool(
    'merge_companies',
    "[CONFIRMATION REQUIRED] Merges two duplicate company records (admins only). The primary company is kept: it takes over the contacts, " +
      'mandates, leads and history, and fills its empty fields (Pappers, website, logo...); the duplicate is then deleted. ' +
      'First call WITHOUT confirm for the preview, then with confirm=true once the user approves.',
    mergeArgs,
    wrapTool('merge_companies', mergeHandler('entreprise', merge.previewMergeEntreprises, merge.mergeEntreprises)),
  );
}
