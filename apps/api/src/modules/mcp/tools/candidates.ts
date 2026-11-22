import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import * as candidatService from '../../candidats/candidat.service.js';
import * as candidatureService from '../../candidatures/candidature.service.js';
import prisma from '../../../lib/db.js';
import { resolvePersonPhoto } from '../../../lib/photo.js';
import * as dossierService from '../../candidats/dossier.service.js';
import * as syntheseService from '../../candidats/synthese.service.js';
import { STAGES_DOC, stageEn } from '../labels.js';

export function registerCandidateTools(server: McpServer) {
  // ─── search_candidates ────────────────────────────────
  server.tool(
    'search_candidates',
    "Searches candidates in the ATS by name, email, job title, company, tags, city or availability. Use to find a candidate, check for duplicates before creating one, or list by criteria.",
    {
      query: z.string().optional().describe('Full-text search: last name, first name, email, job title, company'),
      city: z.string().optional().describe('Filter by city (e.g. Paris, Lyon)'),
      source: z.string().optional().describe('Filter by source: linkedin, referral, jobboard, extension'),
      tags: z.array(z.string()).optional().describe('Filter by tags/skills (e.g. ["CSM", "SaaS"])'),
      disponibilite: z.string().optional().describe('Filter by availability: immediate, 1_mois (1 month), 3_mois (3 months), en_poste (currently employed)'),
      limit: z.number().optional().default(10).describe('Max number of results (default 10, max 50)'),
      offset: z.number().optional().default(0).describe('Pagination offset (default 0)'),
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
            stage_label: stageEn(ca.stage),
          })),
        })),
      };
    }),
  );

  // ─── get_candidate ────────────────────────────────────
  server.tool(
    'get_candidate',
    "Gets the full candidate record: details, experience, linked mandates, latest activity. Use when the recruiter wants the detail of a candidate.",
    {
      candidate_id: z.string().optional().describe('Candidate UUID'),
      candidate_name: z.string().optional().describe('Candidate name (if no UUID, search by name)'),
    },
    wrapTool('get_candidate', async (args) => {
      let candidate: any;
      if (args.candidate_id) {
        candidate = await candidatService.getById(args.candidate_id as string);
      } else if (args.candidate_name) {
        const results = await candidatService.list({ page: 1, perPage: 1 }, args.candidate_name as string);
        candidate = results.data[0];
      }
      if (!candidate) return { error: 'Candidate not found' };

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
          candidature_id: ca.id,
          stage: ca.stage,
          stage_label: stageEn(ca.stage),
        })),
        created_at: candidate.createdAt,
      };
    }),
  );

  // ─── create_candidate ─────────────────────────────────
  server.tool(
    'create_candidate',
    "[CONFIRMATION REQUIRED] Creates a new candidate in the ATS. You MUST show the data to the recruiter and get confirmation before creating.",
    {
      nom: z.string().describe('Last name'),
      prenom: z.string().optional().describe('First name'),
      email: z.string().optional().describe('Email'),
      telephone: z.string().optional().describe('Phone'),
      posteActuel: z.string().optional().describe('Current job title'),
      entrepriseActuelle: z.string().optional().describe('Current company'),
      localisation: z.string().optional().describe('City'),
      linkedin_url: z.string().optional().describe('LinkedIn profile URL'),
      photo_url: z.string().optional().describe('URL of the person photo (e.g. LinkedIn photo). If missing, the photo is looked up on Gravatar when an email is known.'),
      salaire: z.string().optional().describe('Expected salary (e.g. 55000)'),
      source: z.string().optional().describe('Source: linkedin, referral, jobboard, mcp_claude'),
      tags: z.array(z.string()).optional().describe('Tags/skills'),
      mandate_id: z.string().optional().describe('Add straight to a mandate (optional)'),
      stage: z.string().optional().describe('Initial stage code if mandate_id is given (default SOURCING). Codes: ' + STAGES_DOC),
    },
    wrapTool('create_candidate', async (args, user) => {
      // Check duplicates by email
      if (args.email) {
        const dup = await candidatService.checkDuplicate(args.email as string);
        if (dup.exists && dup.match) return {
          error: 'duplicate_detected',
          existing_candidate_id: dup.match.id,
          existing_candidate_name: `${dup.match.prenom || ''} ${dup.match.nom}`.trim(),
          message: 'A candidate with the same email already exists. Use update_candidate to edit it, or merge_candidates if it is a duplicate.',
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
          message: 'A candidate with the same first and last name already exists. Use update_candidate to edit it, or merge_candidates if it is a duplicate.',
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

      return { success: true, candidate_id: candidate.id, message: `Candidate ${`${args.prenom || ''} ${args.nom}`.trim()} created` };
    }),
  );

  // ─── get_candidate_dossier ────────────────────────────
  server.tool(
    'get_candidate_dossier',
    "Reads the client dossier of a candidate: what the client sees on the portal (photo, summary, info cards, fit for the role, sections such as Background). Use before editing it.",
    {
      candidate_id: z.string().describe('Candidate UUID'),
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
    "[CONFIRMATION REQUIRED] Updates the client dossier of a candidate (visible to the client on the portal). Each field you send fully REPLACES the current one; omitted fields do not change. Read it first with get_candidate_dossier. Never put sensitive information in it (health, personal situation, internal budget, contact details). The dossier itself is written in French for French clients unless the recruiter asks otherwise. You MUST show the final dossier to the recruiter and get confirmation before calling.",
    {
      candidate_id: z.string().describe('Candidate UUID'),
      synthese: z.string().optional().describe('Summary paragraph, 500 characters max'),
      infos: z.array(z.object({ label: z.string(), value: z.string() })).optional()
        .describe("Info cards, e.g. [{label:'Localisation', value:'Lyon'}, {label:'Disponibilite', value:'Preavis ~3 mois'}, {label:'Experience', value:'8+ ans'}, {label:'Pretentions', value:'70-75 K€ package'}]"),
      adequation: z.array(z.string()).optional().describe('Points showing fit for the role (8 shown max)'),
      sections: z.array(z.object({ title: z.string(), items: z.array(z.string()) })).optional()
        .describe('Titled sections, e.g. [{title:"Parcours",items:["Depuis 03.2026 : ... · Agicap"]}]'),
      photo_url: z.string().optional().describe('http(s) URL of a photo (JPG/PNG/WebP): it is downloaded and hosted by the ATS. Empty string to remove the photo.'),
      show_contact: z.boolean().optional().describe('Show the candidate email, phone and LinkedIn to the client on the portal (the CV can always be downloaded). Only turn on if the candidate agreed.'),
      protect: z.boolean().optional().default(true).describe('Protect the dossier: a newly imported CV will not overwrite it (default true)'),
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
        message: 'Client dossier updated (visible on the portal)',
      };
    }),
  );

  // ─── Débriefs / synthèses d'entretien ─────────────────
  const debriefView = (s: any) => ({
    debrief_id: s.id,
    filename: s.filename,
    file_url: s.url,
    status: s.status, // propose = a valider, applique, erreur
    status_label: s.status === 'propose' ? 'To review' : s.status === 'applique' ? 'Applied' : s.status === 'erreur' ? 'Error' : s.status,
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
    "Lists the interview debriefs stored on a candidate record (Interviews tab), with the proposed update and its status (propose = to review, applique = applied, erreur = error).",
    { candidate_id: z.string().describe('Candidate UUID') },
    wrapTool('list_candidate_debriefs', async (args) => {
      const rows = await syntheseService.listSyntheses(args.candidate_id as string);
      return { total: rows.length, debriefs: rows.map(debriefView) };
    }),
  );

  server.tool(
    'add_candidate_debrief',
    "[CONFIRMATION REQUIRED] Adds an interview debrief to a candidate record (Interviews tab). The ATS reads it and returns a PROPOSAL (record fields, experiences, client dossier): nothing changes until apply_candidate_debrief is called. Provide ONE source: `text` (recommended: the full debrief content you read in the PDF or document, not a summary), `pdf_url` (https link to the PDF, or a Google Drive link shared with anyone who has the link), or `pdf_base64` (small base64-encoded PDF). Then show the proposal to the recruiter.",
    {
      candidate_id: z.string().describe('Candidate UUID'),
      title: z.string().optional().describe("Debrief name, e.g. 'Interview debrief Vicky 25-09'. For a PDF: the file name."),
      text: z.string().optional().describe('Full debrief content (plain text). Preferred when you have already read the document.'),
      pdf_url: z.string().optional().describe('https link to the PDF (or a public Google Drive share link)'),
      pdf_base64: z.string().optional().describe('Base64-encoded PDF (10 MB max). Avoid for large files.'),
    },
    wrapTool('add_candidate_debrief', async (args, user) => {
      const id = args.candidate_id as string;
      const title = (args.title as string | undefined)?.trim();
      let s: any;
      if (args.pdf_base64) {
        const buffer = Buffer.from(String(args.pdf_base64).replace(/^data:application\/pdf;base64,/, ''), 'base64');
        if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') return { error: 'pdf_base64 does not contain a valid PDF' };
        if (buffer.length > 10 * 1024 * 1024) return { error: 'PDF too large (10 MB max)' };
        const name = title ? (/\.pdf$/i.test(title) ? title : `${title}.pdf`) : 'synthese.pdf';
        s = await syntheseService.uploadSynthese(id, buffer, name, 'application/pdf', user.userId);
      } else if (args.pdf_url) {
        s = await syntheseService.uploadSyntheseFromUrl(id, args.pdf_url as string, user.userId, title);
      } else if (args.text) {
        s = await syntheseService.addSyntheseText(id, args.text as string, title || 'Débrief', user.userId);
      } else {
        return { error: 'Provide text, pdf_url or pdf_base64' };
      }
      return {
        success: s.status !== 'erreur',
        ...debriefView(s),
        message: s.status === 'erreur'
          ? `Debrief stored, but reading it failed: ${s.error}`
          : 'Debrief stored and read. Nothing is applied yet: show the proposal to the recruiter, then call apply_candidate_debrief.',
      };
    }),
  );

  server.tool(
    'apply_candidate_debrief',
    "[CONFIRMATION REQUIRED] Applies the proposal of a stored debrief (see add_candidate_debrief / list_candidate_debriefs). Choose what is applied: record fields, experiences (duplicates are skipped), client dossier. WARNING: apply_client_dossier REPLACES the dossier the client sees on the portal; only turn it on if the recruiter asked, especially if a dossier was already written by hand.",
    {
      candidate_id: z.string().describe('Candidate UUID'),
      debrief_id: z.string().describe('Debrief identifier (debrief_id)'),
      apply_fields: z.boolean().optional().default(true).describe('Apply the record fields (pay, availability, mobility, experience, location)'),
      apply_experiences: z.boolean().optional().default(true).describe('Add the experiences'),
      apply_client_dossier: z.boolean().optional().default(false).describe('Replace the portal client dossier with the one in the proposal (default false)'),
    },
    wrapTool('apply_candidate_debrief', async (args) => {
      const id = args.candidate_id as string;
      const s = (await syntheseService.listSyntheses(id)).find((x) => x.id === args.debrief_id);
      if (!s) return { error: 'Debrief not found for this candidate' };
      if (!s.proposal) return { error: 'This debrief has no proposal (reading failed)' };
      const res = await syntheseService.applySynthese(id, s.id, {
        fields: args.apply_fields === false ? undefined : s.proposal.fields,
        experiences: args.apply_experiences === false ? undefined : s.proposal.experiences,
        dossier: args.apply_client_dossier === true ? s.proposal.dossier : undefined,
      });
      return { success: true, applied: res.applied, message: res.applied.length ? `Applied: ${res.applied.join(', ')}` : 'Nothing to apply' };
    }),
  );

  // ─── update_candidate ─────────────────────────────────
  server.tool(
    'update_candidate',
    "[CONFIRMATION REQUIRED] Updates a candidate details. You MUST show the changes and get confirmation.",
    {
      candidate_id: z.string().describe('Candidate UUID'),
      nom: z.string().optional().describe('Last name (correction)'),
      prenom: z.string().optional().describe('First name (correction)'),
      email: z.string().optional().describe('Candidate email'),
      linkedinUrl: z.string().optional().describe('LinkedIn profile URL'),
      salaire: z.string().optional().describe('Expected salary (e.g. 55000)'),
      disponibilite: z.string().optional().describe('immediate, 1_mois (1 month), 3_mois (3 months), en_poste (currently employed)'),
      posteActuel: z.string().optional().describe('Current job title'),
      entrepriseActuelle: z.string().optional().describe('Current company'),
      telephone: z.string().optional().describe('Phone'),
      localisation: z.string().optional().describe('City'),
      tags: z.array(z.string()).optional().describe('Tags/skills'),
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
      if (Object.keys(updates).length === 0) return { error: 'No update provided' };

      const candidate = await candidatService.update(args.candidate_id as string, updates as any);
      return { success: true, message: `${`${candidate.prenom || ''} ${candidate.nom}`.trim()} updated`, fields_updated: Object.keys(updates) };
    }),
  );

  // ─── suggest_candidates_for_mandate ────────────────────
  server.tool(
    'suggest_candidates_for_mandate',
    "Looks in the talent pool for candidates who could fit a mandate. Use when the recruiter asks who in the database could match mandate X.",
    {
      mandate_id: z.string().describe('Mandate UUID'),
      title_keywords: z.array(z.string()).optional().describe('Keywords for the target job title'),
      city: z.string().optional().describe('City'),
      limit: z.number().optional().default(10).describe('Max number of suggestions'),
    },
    wrapTool('suggest_candidates_for_mandate', async (args, user) => {
      // Get mandate details
      const mandate = await prisma.mandat.findUnique({
        where: { id: args.mandate_id as string },
        include: { entreprise: true, candidatures: { select: { candidatId: true } } },
      });
      if (!mandate) return { error: 'Mandate not found' };

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
    "Deletes a candidate (moves it to the trash with its notes and applications for 30 days; restore_record brings everything back). Not possible while the candidate has active candidatures. For a duplicate, use merge_candidates instead. Human users must confirm first; agent accounts do not need to.",
    {
      candidate_id: z.string().describe('UUID of the candidate to delete'),
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
          error: 'This candidate cannot be deleted: they have active candidatures.',
          active_mandates: activeCandidatures.map((ca: any) => ({
            candidature_id: ca.id,
            mandate: ca.mandat?.titrePoste,
            company: ca.mandat?.entreprise?.nom,
            stage: ca.stage,
            stage_label: stageEn(ca.stage),
          })),
          message: 'Remove the candidate from these mandates first (move_candidate_stage to REFUSE, Lost), then delete.',
        };
      }

      // Delete related data then the candidate
      await prisma.candidature.deleteMany({ where: { candidatId } });
      await prisma.activite.deleteMany({ where: { entiteType: 'CANDIDAT', entiteId: candidatId } });
      await prisma.candidat.delete({ where: { id: candidatId } });

      return { success: true, message: 'Candidate deleted.' };
    }),
  );
}
