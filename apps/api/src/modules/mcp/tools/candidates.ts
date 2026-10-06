import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as candidatService from '../../candidats/candidat.service.js';
import * as candidatureService from '../../candidatures/candidature.service.js';
import prisma from '../../../lib/db.js';
import { resolvePersonPhoto } from '../../../lib/photo.js';
import * as dossierService from '../../candidats/dossier.service.js';
import * as syntheseService from '../../candidats/synthese.service.js';

export function registerCandidateTools(server: McpServer) {
  // ─── search_candidates ────────────────────────────────
  server.tool(
    'search_candidates',
    "Recherche des candidats dans l'ATS par nom, email, poste, entreprise, tags, ville ou disponibilite. Utiliser pour retrouver un candidat, verifier les doublons avant creation, ou lister par critere.",
    {
      query: z.string().optional().describe('Recherche full-text : nom, prenom, email, poste, entreprise'),
      city: z.string().optional().describe('Filtrer par ville (ex: Paris, Lyon)'),
      source: z.string().optional().describe('Filtrer par source : linkedin, referral, jobboard, extension'),
      tags: z.array(z.string()).optional().describe('Filtrer par tags/competences (ex: ["CSM", "SaaS"])'),
      disponibilite: z.string().optional().describe('Filtrer par disponibilite : immediate, 1_mois, 3_mois, en_poste'),
      limit: z.number().optional().default(10).describe('Nombre max de resultats (defaut 10, max 50)'),
      offset: z.number().optional().default(0).describe('Offset pour pagination (defaut 0)'),
    },
    wrapTool('search_candidates', async (args, user) => {
      const limit = Math.min((args.limit as number) || 10, 50);
      const offset = (args.offset as number) || 0;
      const page = Math.floor(offset / limit) + 1;
      const result = await candidatService.list(
        { page, perPage: limit },
        args.query as string | undefined,
        args.city as string | undefined,        // localisation
        args.source as string | undefined,       // source
        args.tags as string[] | undefined,       // tags
        undefined,                               // salaireMin
        undefined,                               // salaireMax
        undefined,                               // poste
        undefined,                               // entreprise
        args.disponibilite as string | undefined, // disponibilite
        undefined, // assignedToId — tous les recruteurs voient toute la base candidats
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
          salary: c.salaireSouhaite,
          disponibilite: c.disponibilite,
          source: c.source,
          tags: c.tags,
          mandates: c.candidatures?.map((ca: any) => ({
            mandate_title: ca.mandat?.titrePoste,
            stage: ca.stage,
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
        salary: candidate.salaireSouhaite,
        experience_years: candidate.anneesExperience,
        availability: candidate.disponibilite,
        source: candidate.source,
        tags: candidate.tags,
        linkedin_url: candidate.linkedinUrl,
        cv_text: candidate.cvTexte ? candidate.cvTexte.substring(0, 500) + '...' : null,
        ai_pitch: candidate.aiPitchShort,
        ai_selling_points: candidate.aiSellingPoints,
        experiences: candidate.experiences?.map((e: any) => ({
          title: e.titre,
          company: e.entreprise,
          period: `${e.anneeDebut || ''} - ${e.anneeFin || 'present'}`,
          highlights: e.highlights,
        })),
        mandates: candidate.candidatures?.map((ca: any) => ({
          id: ca.mandatId,
          title: ca.mandat?.titrePoste,
          company: ca.mandat?.entreprise?.nom,
          stage: ca.stage,
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
      linkedin_url: z.string().optional().describe('URL du profil LinkedIn'),
      photo_url: z.string().optional().describe('URL de la photo de la personne (ex. photo LinkedIn). Si absente, la photo est cherchee via Gravatar quand un email est connu.'),
      salaire: z.string().optional().describe('Salaire souhaite (ex: 55000)'),
      source: z.string().optional().describe('Source : linkedin, referral, jobboard, mcp_claude'),
      tags: z.array(z.string()).optional().describe('Tags/competences'),
      mandate_id: z.string().optional().describe('Ajouter directement a un mandat (optionnel)'),
      stage: z.string().optional().describe('Etape initiale si mandate_id fourni : SOURCING, CONTACTE, ENTRETIEN_1, ENVOYE_CLIENT, ENTRETIEN_CLIENT, PROCESS, OFFRE. Defaut: SOURCING'),
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

      // Map 'salaire' → 'salaireSouhaite' (Int in Prisma)
      const salaireParsed = args.salaire ? parseInt(String(args.salaire).replace(/[^\d]/g, ''), 10) || undefined : undefined;
      const photoUrl = await resolvePersonPhoto({ photoUrl: args.photo_url as string, email: args.email as string });
      const candidate = await candidatService.create({
        nom: args.nom as string,
        prenom: args.prenom as string,
        email: args.email as string,
        telephone: args.telephone as string,
        posteActuel: args.posteActuel as string,
        entrepriseActuelle: args.entrepriseActuelle as string,
        localisation: args.localisation as string,
        linkedinUrl: args.linkedin_url as string,
        photoUrl: photoUrl ?? undefined,
        salaireSouhaite: salaireParsed,
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

  // ─── get_candidate_dossier ────────────────────────────
  server.tool(
    'get_candidate_dossier',
    "Lit le dossier client d'un candidat : ce que le client voit sur le portail (photo, synthese, cartes d'infos, adequation au poste, sections comme Parcours). Utiliser avant de le modifier.",
    {
      candidate_id: z.string().describe('UUID du candidat'),
    },
    wrapTool('get_candidate_dossier', async (args) => {
      const d = await dossierService.getDossier(args.candidate_id as string);
      return {
        candidate_id: d.candidatId,
        name: `${d.prenom || ''} ${d.nom}`.trim(),
        header: [d.posteActuel, d.entrepriseActuelle].filter(Boolean).join(' · '),
        photo_url: d.photoUrl,
        synthese: d.synthese,
        infos: d.infos,
        adequation: d.adequation,
        sections: d.sections,
        protected: d.manuel,
        contact_visible_to_client: d.coordonneesVisibles,
        updated_at: d.modifieLe,
      };
    }),
  );

  // ─── update_candidate_dossier ─────────────────────────
  server.tool(
    'update_candidate_dossier',
    "[CONFIRMATION REQUISE] Met a jour le dossier client d'un candidat (visible par le client sur le portail). Chaque champ fourni REMPLACE entierement l'existant ; les champs omis ne changent pas. Lire d'abord avec get_candidate_dossier. Ne jamais y mettre d'infos sensibles (sante, situation perso, enveloppe interne, coordonnees). Tu DOIS montrer le dossier final au recruteur et obtenir sa confirmation avant d'appeler.",
    {
      candidate_id: z.string().describe('UUID du candidat'),
      synthese: z.string().optional().describe('Paragraphe de synthese, 500 caracteres maximum'),
      infos: z.array(z.object({ label: z.string(), value: z.string() })).optional()
        .describe("Cartes d'infos, ex. [{label:'Localisation', value:'Lyon'}, {label:'Disponibilite', value:'Preavis ~3 mois'}, {label:'Experience', value:'8+ ans'}, {label:'Pretentions', value:'70-75 K€ package'}]"),
      adequation: z.array(z.string()).optional().describe("Points d'adequation au poste (8 max affiches)"),
      sections: z.array(z.object({ title: z.string(), items: z.array(z.string()) })).optional()
        .describe('Sections titrees, ex. [{title:"Parcours",items:["Depuis 03.2026 : ... · Agicap"]}]'),
      photo_url: z.string().optional().describe("URL http(s) d'une photo (JPG/PNG/WebP) : elle est telechargee et hebergee par l'ATS. Chaine vide pour retirer la photo."),
      show_contact: z.boolean().optional().describe("Montrer au client l'email, le telephone et le LinkedIn du candidat sur le portail (le CV, lui, est toujours telechargeable). A activer seulement si le candidat a donne son accord."),
      protect: z.boolean().optional().default(true).describe("Proteger le dossier : un nouveau CV importe ne l'ecrasera pas (defaut true)"),
    },
    wrapTool('update_candidate_dossier', async (args) => {
      const id = args.candidate_id as string;
      if (args.photo_url !== undefined) {
        const url = String(args.photo_url).trim();
        if (url) await dossierService.setPhotoFromUrl(id, url);
        else await dossierService.removePhoto(id);
      }
      const hasContent = ['synthese', 'infos', 'adequation', 'sections', 'show_contact'].some((k) => args[k] !== undefined);
      const d = hasContent || args.protect !== undefined
        ? await dossierService.updateDossier(id, {
            synthese: args.synthese as string | undefined,
            infos: args.infos as any,
            adequation: args.adequation as string[] | undefined,
            sections: args.sections as any,
            manuel: args.protect as boolean | undefined,
            coordonneesVisibles: args.show_contact as boolean | undefined,
          })
        : await dossierService.getDossier(id);
      return {
        success: true,
        candidate_id: d.candidatId,
        photo_url: d.photoUrl,
        synthese: d.synthese,
        infos: d.infos,
        adequation: d.adequation,
        sections: d.sections,
        protected: d.manuel,
        contact_visible_to_client: d.coordonneesVisibles,
        message: 'Dossier client mis a jour (visible sur le portail)',
      };
    }),
  );

  // ─── Débriefs / synthèses d'entretien ─────────────────
  const debriefView = (s: any) => ({
    debrief_id: s.id,
    filename: s.filename,
    file_url: s.url,
    status: s.status, // propose = à valider, applique, erreur
    error: s.error,
    created_at: s.createdAt,
    applied_at: s.appliedAt,
    proposal: s.proposal
      ? {
          internal_summary: s.proposal.resume,
          fields: s.proposal.fields,
          experiences: s.proposal.experiences,
          client_dossier: s.proposal.dossier,
        }
      : null,
  });

  server.tool(
    'list_candidate_debriefs',
    "Liste les debriefs / syntheses d'entretien ranges sur la fiche d'un candidat (onglet Entretiens), avec la proposition de mise a jour et son statut (propose = a valider, applique, erreur).",
    { candidate_id: z.string().describe('UUID du candidat') },
    wrapTool('list_candidate_debriefs', async (args) => {
      const rows = await syntheseService.listSyntheses(args.candidate_id as string);
      return { total: rows.length, debriefs: rows.map(debriefView) };
    }),
  );

  server.tool(
    'add_candidate_debrief',
    "[CONFIRMATION REQUISE] Ajoute un debrief / une synthese d'entretien sur la fiche d'un candidat (onglet Entretiens). L'ATS le lit et renvoie une PROPOSITION (champs de la fiche, experiences, dossier client) : rien n'est modifie tant que apply_candidate_debrief n'est pas appele. Fournir UNE source : `text` (recommande : le contenu integral du debrief que tu as lu dans le PDF ou le document, sans le resumer), `pdf_url` (lien https vers le PDF, ou lien Google Drive partage a tous ceux qui ont le lien), ou `pdf_base64` (petit PDF encode en base64). Montre ensuite la proposition au recruteur.",
    {
      candidate_id: z.string().describe('UUID du candidat'),
      title: z.string().optional().describe("Nom du debrief, ex. 'Synthese entretien Vicky 25-09'. Pour un PDF : nom du fichier."),
      text: z.string().optional().describe('Contenu integral du debrief (texte brut). A privilegier quand tu as deja lu le document.'),
      pdf_url: z.string().optional().describe('Lien https vers le PDF (ou lien de partage Google Drive public)'),
      pdf_base64: z.string().optional().describe('PDF encode en base64 (10 Mo max). A eviter pour les gros fichiers.'),
    },
    wrapTool('add_candidate_debrief', async (args, user) => {
      const id = args.candidate_id as string;
      const title = (args.title as string | undefined)?.trim();
      let s: any;
      if (args.pdf_base64) {
        const buffer = Buffer.from(String(args.pdf_base64).replace(/^data:application\/pdf;base64,/, ''), 'base64');
        if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return { error: 'pdf_base64 ne contient pas un PDF valide' };
        if (buffer.length > 10 * 1024 * 1024) return { error: 'PDF trop volumineux (max 10 Mo)' };
        const name = title ? (/\.pdf$/i.test(title) ? title : `${title}.pdf`) : 'synthese.pdf';
        s = await syntheseService.uploadSynthese(id, buffer, name, 'application/pdf', user.userId);
      } else if (args.pdf_url) {
        s = await syntheseService.uploadSyntheseFromUrl(id, args.pdf_url as string, user.userId, title);
      } else if (args.text) {
        s = await syntheseService.addSyntheseText(id, args.text as string, title || 'Débrief', user.userId);
      } else {
        return { error: 'Fournir text, pdf_url ou pdf_base64' };
      }
      return {
        success: s.status !== 'erreur',
        ...debriefView(s),
        message: s.status === 'erreur'
          ? `Debrief range, mais la lecture a echoue : ${s.error}`
          : "Debrief range et lu. Rien n'est encore applique : montre la proposition au recruteur puis appelle apply_candidate_debrief.",
      };
    }),
  );

  server.tool(
    'apply_candidate_debrief',
    "[CONFIRMATION REQUISE] Applique la proposition d'un debrief deja range (voir add_candidate_debrief / list_candidate_debriefs). Choisir ce qui est applique : champs de la fiche, experiences (les doublons sont ignores), dossier client. ATTENTION : apply_client_dossier REMPLACE le dossier que le client voit sur le portail ; ne l'activer que si le recruteur l'a demande, surtout si un dossier a deja ete redige a la main.",
    {
      candidate_id: z.string().describe('UUID du candidat'),
      debrief_id: z.string().describe('Identifiant du debrief (debrief_id)'),
      apply_fields: z.boolean().optional().default(true).describe('Appliquer les champs de la fiche (remuneration, disponibilite, mobilite, experience, localisation)'),
      apply_experiences: z.boolean().optional().default(true).describe('Ajouter les experiences'),
      apply_client_dossier: z.boolean().optional().default(false).describe('Remplacer le dossier client du portail par celui de la proposition (defaut false)'),
    },
    wrapTool('apply_candidate_debrief', async (args) => {
      const id = args.candidate_id as string;
      const s = (await syntheseService.listSyntheses(id)).find((x) => x.id === args.debrief_id);
      if (!s) return { error: 'Debrief introuvable pour ce candidat' };
      if (!s.proposal) return { error: "Ce debrief n'a pas de proposition (lecture echouee)" };
      const res = await syntheseService.applySynthese(id, s.id, {
        fields: args.apply_fields === false ? undefined : s.proposal.fields,
        experiences: args.apply_experiences === false ? undefined : s.proposal.experiences,
        dossier: args.apply_client_dossier === true ? s.proposal.dossier : undefined,
      });
      return { success: true, applied: res.applied, message: res.applied.length ? `Applique : ${res.applied.join(', ')}` : 'Rien a appliquer' };
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
      salaire: z.string().optional().describe('Salaire souhaite (ex: 55000)'),
      disponibilite: z.string().optional().describe('immediate, 1_mois, 3_mois, en_poste'),
      posteActuel: z.string().optional().describe('Poste actuel'),
      entrepriseActuelle: z.string().optional().describe('Entreprise actuelle'),
      telephone: z.string().optional().describe('Telephone'),
      localisation: z.string().optional().describe('Ville'),
      tags: z.array(z.string()).optional().describe('Tags/competences'),
    },
    wrapTool('update_candidate', async (args) => {
      const updates: Record<string, unknown> = {};
      for (const key of ['nom', 'prenom', 'email', 'linkedinUrl', 'disponibilite', 'posteActuel', 'entrepriseActuelle', 'telephone', 'localisation', 'tags']) {
        if (args[key] !== undefined) updates[key] = args[key];
      }
      // Map 'salaire' → 'salaireSouhaite' (Int in Prisma)
      if (args.salaire !== undefined) {
        const parsed = parseInt(String(args.salaire).replace(/[^\d]/g, ''), 10);
        if (parsed) updates.salaireSouhaite = parsed;
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
        undefined, // assignedToId — tous les recruteurs voient toute la base
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
          salary: c.salaireSouhaite,
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
