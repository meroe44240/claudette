import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';
import { detectDuplicates } from '../../candidats/duplicate.service.js';
import * as merge from '../../merge/merge.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const mergeArgs = {
  primary_id: z.string().describe('UUID de la fiche a GARDER (principale)'),
  duplicate_id: z.string().describe('UUID du doublon, absorbe puis supprime'),
  confirm: z.boolean().optional().describe(
    "false ou absent = apercu seulement, rien n'est modifie. true = fusion reelle, a passer uniquement apres accord explicite de l'utilisateur sur l'apercu.",
  ),
};

type Preview = (p: string, d: string) => Promise<unknown>;
type Run = (p: string, d: string, userId?: string) => Promise<unknown>;

function mergeHandler(entite: string, preview: Preview, run: Run) {
  return async (args: Record<string, unknown>, user: { userId: string }) => {
    const primaryId = String(args.primary_id ?? '').trim();
    const duplicateId = String(args.duplicate_id ?? '').trim();
    if (!UUID_RE.test(primaryId) || !UUID_RE.test(duplicateId)) {
      return { error: 'invalid_id', message: `primary_id et duplicate_id doivent etre des UUID de ${entite}. Utilise find_duplicates ou la recherche pour les trouver.` };
    }
    try {
      if (args.confirm !== true) {
        return {
          preview: true,
          ...(await preview(primaryId, duplicateId) as object),
          message: "Apercu uniquement, rien n'a ete modifie. Montre-le a l'utilisateur et, s'il valide, rappelle avec confirm=true. La fusion est definitive : le doublon est supprime.",
        };
      }
      const result = await run(primaryId, duplicateId, user.userId);
      return { success: true, ...(result as object), message: `Fusion effectuee : le doublon a ete absorbe dans la fiche ${primaryId}.` };
    } catch (err) {
      if (err instanceof merge.MergeError) return { error: err.code, message: err.message };
      throw err;
    }
  };
}

export function registerMergeTools(server: McpServer) {
  // ─── find_duplicates ──────────────────────────────────
  server.tool(
    'find_duplicates',
    "Liste les doublons probables (reserve aux admins). Candidats : meme email ou meme LinkedIn. Clients : meme email. Entreprises : meme nom ou meme domaine. " +
      "La premiere fiche de chaque groupe est la plus ancienne, c'est elle qu'on garde en general.",
    {
      entity: z.enum(['candidat', 'client', 'entreprise']).describe('Type de fiche'),
    },
    wrapTool('find_duplicates', async (args) => {
      if (args.entity === 'candidat') {
        const { groups } = await detectDuplicates();
        return { entity: 'candidat', count: groups.length, groups };
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
          if (clients.length > 1) groups.push({ raison: `Email identique : ${r.email}`, fiches: clients });
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
        groups.push({ raison: `${type === 'nom' ? 'Nom' : 'Domaine'} identique : ${valeur}`, fiches: entreprises });
      }
      return { entity: 'entreprise', count: groups.length, groups };
    }),
  );

  // ─── merge_candidates ─────────────────────────────────
  server.tool(
    'merge_candidates',
    "[CONFIRMATION REQUISE] Fusionne deux fiches candidat en doublon (reserve aux admins). La fiche principale est gardee : elle recupere les candidatures, " +
      "l'historique, les notes, les appels et complete ses champs vides avec ceux du doublon, qui est ensuite supprime. " +
      "Si les deux sont sur le meme mandat, la candidature la plus avancee est gardee. Appelle d'abord SANS confirm pour obtenir l'apercu, " +
      "montre-le a l'utilisateur, puis rappelle avec confirm=true seulement s'il valide.",
    mergeArgs,
    wrapTool('merge_candidates', mergeHandler('candidat', merge.previewMergeCandidats, merge.mergeCandidats)),
  );

  // ─── merge_clients ────────────────────────────────────
  server.tool(
    'merge_clients',
    "[CONFIRMATION REQUISE] Fusionne deux fiches contact client en doublon (reserve aux admins). La fiche principale est gardee : elle recupere les mandats, " +
      "les acces portail, les leads, l'historique et complete ses champs vides ; le doublon est ensuite supprime. " +
      "Appelle d'abord SANS confirm pour l'apercu, puis avec confirm=true apres accord de l'utilisateur.",
    mergeArgs,
    wrapTool('merge_clients', mergeHandler('client', merge.previewMergeClients, merge.mergeClients)),
  );

  // ─── merge_companies ──────────────────────────────────
  server.tool(
    'merge_companies',
    "[CONFIRMATION REQUISE] Fusionne deux fiches entreprise en doublon (reserve aux admins). L'entreprise principale est gardee : elle recupere les contacts, " +
      "les mandats, les leads, l'historique et complete ses champs vides (Pappers, site, logo...) ; le doublon est ensuite supprime. " +
      "Appelle d'abord SANS confirm pour l'apercu, puis avec confirm=true apres accord de l'utilisateur.",
    mergeArgs,
    wrapTool('merge_companies', mergeHandler('entreprise', merge.previewMergeEntreprises, merge.mergeEntreprises)),
  );
}
