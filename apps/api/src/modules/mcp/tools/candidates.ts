import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as candidatService from '../../candidats/candidat.service.js';
import * as candidatureService from '../../candidatures/candidature.service.js';
import prisma from '../../../lib/db.js';

export function registerCandidateTools(server: McpServer) {
  // ─── search_candidates ────────────────────────────────
  server.tool(
    'search_candidates',
    "Recherche des candidats dans l'ATS par nom, email, titre, entreprise, competences, ville, ou mandat. Utiliser quand le recruteur cherche un candidat ou veut une liste.",
    {
      query: z.string().describe('Recherche libre : nom, email, titre, ou mot-cle'),
      city: z.string().optional().describe('Filtrer par ville'),
      source: z.string().optional().describe('Filtrer par source : linkedin, referral, jobboard, extension'),
      tags: z.array(z.string()).optional().describe('Filtrer par tags/competences'),
      limit: z.number().optional().default(10).describe('Nombre max de resultats (defaut 10)'),
    },
    wrapTool('search_candidates', async (args, user) => {
      const result = await candidatService.list(
        { page: 1, perPage: (args.limit as number) || 10 },
        args.query as string,
        args.city as string | undefined,        // localisation
        args.source as string | undefined,       // source
        args.tags as string[] | undefined,       // tags
        undefined,                               // salaireMin
        undefined,                               // salaireMax
        undefined,                               // poste
        undefined,                               // entreprise
        undefined,                               // disponibilite
        user.userRole !== 'ADMIN' ? user.userId : undefined, // assignedToId
      );
      return {
        total: result.meta.total,
        candidates: result.data.map((c: any) => ({
          id: c.id,
          name: `${c.prenom || ''} ${c.nom}`.trim(),
          title: c.posteActuel,
          company: c.entrepriseActuelle,
          city: c.localisation,
          email: c.email,
          phone: c.telephone,
          salary: c.salaire,
          source: c.source,
          tags: c.tags,
          mandates: c.candidatures?.map((ca: any) => ({
            mandate_title: ca.mandat?.titrePoste,
            stage: ca.stade,
          })),
        })),
      };
    }),
  );

  // ─── get_candidate ────────────────────────────────────
  server.tool(
    'get_candidate',
    "Recupere la fiche complete d'un candidat : infos, experience, mandats lies, dernieres activites. Utiliser quand le recruteur veut voir le detail d'un candidat.",
    {
      candidate_id: z.string().optional().describe('UUID du candidat'),
      candidate_name: z.string().optional().describe("Nom du candidat (si pas d'UUID, on cherche par nom)"),
    },
    wrapTool('get_candidate', async (args) => {
      let candidate: any;
      if (args.candidate_id) {
        candidate = await candidatService.getById(args.candidate_id as string);
      } else if (args.candidate_name) {
        const results = await candidatService.list({ page: 1, perPage: 1 }, args.candidate_name as string);
        candidate = results.data[0];
      }
      if (!candidate) return { error: 'Candidat non trouve' };

      return {
        id: candidate.id,
        name: `${candidate.prenom || ''} ${candidate.nom}`.trim(),
        title: candidate.posteActuel,
        company: candidate.entrepriseActuelle,
        email: candidate.email,
        phone: candidate.telephone,
        city: candidate.localisation,
        salary: candidate.salaire,
        experience_years: candidate.anneesExperience,
        availability: candidate.disponibilite,
        source: candidate.source,
        tags: candidate.tags,
        linkedin_url: candidate.linkedinUrl,
        cv_text: candidate.cvText ? candidate.cvText.substring(0, 500) + '...' : null,
        ai_pitch: candidate.aiPitchCourt,
        ai_selling_points: candidate.aiPointsForts,
        experiences: candidate.experiences?.map((e: any) => ({
          title: e.titre,
          company: e.entreprise,
          period: `${e.dateDebut || ''} - ${e.dateFin || 'present'}`,
          description: e.description?.substring(0, 200),
        })),
        mandates: candidate.candidatures?.map((ca: any) => ({
          id: ca.mandatId,
          title: ca.mandat?.titrePoste,
          company: ca.mandat?.entreprise?.nom,
          stage: ca.stade,
        })),
        created_at: candidate.createdAt,
      };
    }),
  );

  // ─── create_candidate ─────────────────────────────────
  server.tool(
    'create_candidate',
    "[CONFIRMATION REQUISE] Cree un nouveau candidat dans l'ATS. Tu DOIS demander confirmation au recruteur en montrant les donnees avant de creer.",
    {
      nom: z.string().describe('Nom de famille'),
      prenom: z.string().optional().describe('Prenom'),
      email: z.string().optional().describe('Email'),
      telephone: z.string().optional().describe('Telephone'),
      posteActuel: z.string().optional().describe('Poste actuel'),
      entrepriseActuelle: z.string().optional().describe('Entreprise actuelle'),
      localisation: z.string().optional().describe('Ville'),
      salaire: z.string().optional().describe('Salaire souhaite'),
      source: z.string().optional().describe('Source : linkedin, referral, jobboard, mcp_claude'),
      tags: z.array(z.string()).optional().describe('Tags/competences'),
      mandate_id: z.string().optional().describe('Ajouter directement a un mandat (optionnel)'),
      stage: z.string().optional().describe('Etape initiale si mandate_id fourni : SOURCING, CONTACTE, ENTRETIEN_1, ENTRETIEN_CLIENT, OFFRE. Defaut: SOURCING'),
    },
    wrapTool('create_candidate', async (args, user) => {
      // Check duplicates by email
      if (args.email) {
        const dup = await candidatService.checkDuplicate(args.email as string);
        if (dup.exists && dup.match) return {
          error: 'duplicate_detected',
          existing_candidate_id: dup.match.id,
          existing_candidate_name: `${dup.match.prenom || ''} ${dup.match.nom}`.trim(),
          message: 'Un candidat avec le meme email existe deja. Utilisez update_candidate pour le modifier.',
        };
      }

      // Check duplicates by nom + prenom (case-insensitive)
      if (args.nom && args.prenom) {
        const existingByName = await prisma.candidat.findFirst({
          where: {
            nom: { equals: args.nom as string, mode: 'insensitive' },
            prenom: { equals: args.prenom as string, mode: 'insensitive' },
          },
          select: { id: true, nom: true, prenom: true, email: true },
        });
        if (existingByName) return {
          error: 'duplicate_detected',
          existing_candidate_id: existingByName.id,
          existing_candidate_name: `${existingByName.prenom || ''} ${existingByName.nom}`.trim(),
          message: 'Un candidat avec le meme nom+prenom existe deja. Utilisez update_candidate pour le modifier.',
        };
      }

      const candidate = await candidatService.create({
        nom: args.nom as string,
        prenom: args.prenom as string,
        email: args.email as string,
        telephone: args.telephone as string,
        posteActuel: args.posteActuel as string,
        entrepriseActuelle: args.entrepriseActuelle as string,
        localisation: args.localisation as string,
        salaire: args.salaire as string,
        source: (args.source as string) || 'mcp_claude',
        tags: args.tags as string[],
      } as any, user.userId);

      // Add to mandate if specified
      if (args.mandate_id && candidate) {
        await candidatureService.create({
          mandatId: args.mandate_id as string,
          candidatId: candidate.id,
          stage: ((args.stage as string) || 'SOURCING') as any,
        } as any, user.userId);
      }

      return { success: true, candidate_id: candidate.id, message: `Candidat ${args.prenom || ''} ${args.nom} cree` };
    }),
  );

  // ─── update_candidate ─────────────────────────────────
  server.tool(
    'update_candidate',
    "[CONFIRMATION REQUISE] Met a jour les informations d'un candidat. Tu DOIS demander confirmation en montrant les changements.",
    {
      candidate_id: z.string().describe('UUID du candidat'),
      nom: z.string().optional().describe('Nom de famille (correction)'),
      prenom: z.string().optional().describe('Prenom (correction)'),
      email: z.string().optional().describe('Email du candidat'),
      linkedinUrl: z.string().optional().describe('URL du profil LinkedIn'),
      salaire: z.string().optional().describe('Ex: 80k fixe + variable'),
      disponibilite: z.string().optional().describe('immediate, 1_mois, 3_mois, en_poste'),
      posteActuel: z.string().optional().describe('Poste actuel'),
      entrepriseActuelle: z.string().optional().describe('Entreprise actuelle'),
      telephone: z.string().optional().describe('Telephone'),
      localisation: z.string().optional().describe('Ville'),
      tags: z.array(z.string()).optional().describe('Tags/competences'),
    },
    wrapTool('update_candidate', async (args) => {
      const updates: Record<string, unknown> = {};
      for (const key of ['nom', 'prenom', 'email', 'linkedinUrl', 'salaire', 'disponibilite', 'posteActuel', 'entrepriseActuelle', 'telephone', 'localisation', 'tags']) {
        if (args[key] !== undefined) updates[key] = args[key];
      }
      if (Object.keys(updates).length === 0) return { error: 'Aucune mise a jour fournie' };

      const candidate = await candidatService.update(args.candidate_id as string, updates as any);
      return { success: true, message: `Fiche de ${candidate.prenom || ''} ${candidate.nom} mise a jour`, fields_updated: Object.keys(updates) };
    }),
  );

  // ─── suggest_candidates_for_mandate ────────────────────
  server.tool(
    'suggest_candidates_for_mandate',
    "Cherche dans le vivier les candidats qui pourraient correspondre a un mandat. Utiliser quand le recruteur dit 'qui dans ma base peut coller au mandat X'.",
    {
      mandate_id: z.string().describe('UUID du mandat'),
      title_keywords: z.array(z.string()).optional().describe('Mots-cles du titre recherche'),
      city: z.string().optional().describe('Ville'),
      limit: z.number().optional().default(10).describe('Nombre max de suggestions'),
    },
    wrapTool('suggest_candidates_for_mandate', async (args, user) => {
      // Get mandate details
      const mandate = await prisma.mandat.findUnique({
        where: { id: args.mandate_id as string },
        include: { entreprise: true, candidatures: { select: { candidatId: true } } },
      });
      if (!mandate) return { error: 'Mandat non trouve' };

      const existingIds = mandate.candidatures.map(c => c.candidatId);
      const searchTerms = (args.title_keywords as string[])?.join(' ') || mandate.titrePoste || '';

      const results = await candidatService.list(
        { page: 1, perPage: (args.limit as number) || 10 },
        searchTerms,
        args.city as string || mandate.localisation || undefined,
        undefined, undefined, undefined, undefined, undefined, undefined, undefined,
        user.userRole !== 'ADMIN' ? user.userId : undefined,
      );

      const filtered = results.data.filter((c: any) => !existingIds.includes(c.id));
      return {
        mandate: { title: mandate.titrePoste, company: mandate.entreprise?.nom },
        suggestions: filtered.map((c: any) => ({
          id: c.id,
          name: `${c.prenom || ''} ${c.nom}`.trim(),
          title: c.posteActuel,
          company: c.entrepriseActuelle,
          city: c.localisation,
          salary: c.salaire,
          tags: c.tags,
        })),
      };
    }),
  );

  // ─── delete_candidate ─────────────────────────────────
  server.tool(
    'delete_candidate',
    "[CONFIRMATION REQUISE] Supprime un candidat. Impossible si le candidat a des candidatures actives. Tu DOIS demander confirmation.",
    {
      candidate_id: z.string().describe('UUID du candidat a supprimer'),
    },
    wrapTool('delete_candidate', async (args) => {
      const candidatId = args.candidate_id as string;

      // Check for active candidatures
      const activeCandidatures = await prisma.candidature.findMany({
        where: { candidatId, stage: { notIn: ['REFUSE'] } },
        include: { mandat: { select: { titrePoste: true, entreprise: { select: { nom: true } } } } },
      });

      if (activeCandidatures.length > 0) {
        return {
          error: 'Impossible de supprimer ce candidat — il a des candidatures actives.',
          active_mandates: activeCandidatures.map((ca: any) => ({
            candidature_id: ca.id,
            mandate: ca.mandat?.titrePoste,
            company: ca.mandat?.entreprise?.nom,
            stage: ca.stage,
          })),
          message: 'Retirez le candidat de ces mandats (move_candidate_stage → REFUSE) avant de supprimer.',
        };
      }

      // Delete related data then the candidate
      await prisma.candidature.deleteMany({ where: { candidatId } });
      await prisma.activite.deleteMany({ where: { entiteType: 'CANDIDAT', entiteId: candidatId } });
      await prisma.candidat.delete({ where: { id: candidatId } });

      return { success: true, message: 'Candidat supprime.' };
    }),
  );
}
