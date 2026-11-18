import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { wrapTool } from '../mcp.tools.js';
import prisma from '../../../lib/db.js';
import { stageEn } from '../labels.js';

export function registerAiTools(server: McpServer) {
  // ─── get_call_brief ───────────────────────────────────
  server.tool(
    'get_call_brief',
    "Builds a pre-call brief for a contact from the ATS context (latest interactions, mandates, notes). Use when the recruiter says 'prepare my brief for my call with X'.",
    {
      contact_id: z.string().describe('Contact UUID'),
      contact_type: z.string().describe('candidate or client'),
    },
    wrapTool('get_call_brief', async (args) => {
      const contactType = args.contact_type as string;
      const contactId = args.contact_id as string;

      let contact: any;
      if (contactType === 'candidate') {
        contact = await prisma.candidat.findUnique({
          where: { id: contactId },
          include: { candidatures: { include: { mandat: { include: { entreprise: true } } } } },
        });
      } else {
        contact = await prisma.client.findUnique({
          where: { id: contactId },
          include: { entreprise: true, mandats: true },
        });
      }
      if (!contact) return { error: 'Contact not found' };

      // Recent activities
      const activities = await prisma.activite.findMany({
        where: { entiteType: contactType === 'candidate' ? 'CANDIDAT' : 'CLIENT', entiteId: contactId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { type: true, titre: true, contenu: true, createdAt: true, direction: true },
      });

      // Notes
      const notes = await prisma.activite.findMany({
        where: { entiteType: contactType === 'candidate' ? 'CANDIDAT' : 'CLIENT', entiteId: contactId, type: 'NOTE' },
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { contenu: true, createdAt: true },
      });

      const contactInfo = contactType === 'candidate' ? {
        name: `${contact.prenom || ''} ${contact.nom}`.trim(),
        title: contact.posteActuel,
        company: contact.entrepriseActuelle,
        salary: contact.salaireActuel ?? null,
        expected_salary: contact.salaireSouhaite ?? null,
        availability: contact.disponibilite,
        mandates: contact.candidatures?.map((ca: any) => ({
          title: ca.mandat?.titrePoste,
          company: ca.mandat?.entreprise?.nom,
          stage: ca.stage,
          stage_label: stageEn(ca.stage),
        })),
      } : {
        name: `${contact.prenom || ''} ${contact.nom}`.trim(),
        title: contact.titre,
        company: contact.entreprise?.nom,
        status: contact.statutClient,
        mandates: contact.mandats?.map((m: any) => ({ title: m.titrePoste, status: m.statut })),
      };

      return {
        contact: contactInfo,
        recent_interactions: activities.map(a => ({
          type: a.type,
          title: a.titre,
          date: a.createdAt,
          direction: a.direction,
          summary: a.contenu?.substring(0, 200),
        })),
        notes: notes.map(n => ({ text: n.contenu, date: n.createdAt })),
        talking_points: [
          activities.length === 0 ? 'First contact: introduce yourself and set the context.' : `Last contact on ${activities[0]?.createdAt?.toLocaleDateString('en-GB')}`,
          contactType === 'candidate' && (contact.salaireActuel || contact.salaireSouhaite) ? `Salary: current ${contact.salaireActuel ?? "unknown"}, expected ${contact.salaireSouhaite ?? "unknown"}` : null,
          contactType === 'candidate' && contact.disponibilite ? `Availability: ${contact.disponibilite}` : null,
        ].filter(Boolean),
      };
    }),
  );

  // ─── click_to_call ────────────────────────────────────
  server.tool(
    'click_to_call',
    "Starts a phone call through Allo VoIP. Use when the recruiter says 'call Pierre' or 'give Fatima a call'.",
    {
      phone_number: z.string().describe('Phone number to call'),
      contact_name: z.string().optional().describe('Contact name'),
      contact_id: z.string().optional().describe('Contact UUID'),
      contact_type: z.string().optional().describe('candidate or client'),
    },
    wrapTool('click_to_call', async (args) => {
      const alloLink = `https://app.withallo.com/call/${encodeURIComponent(args.phone_number as string)}`;
      return {
        success: true,
        message: `Call started to ${args.contact_name || args.phone_number}`,
        allo_link: alloLink,
        instruction: "Click the link to start the call in Allo. The transcript and summary will be generated automatically.",
      };
    }),
  );

  // ─── validate_call_analysis ───────────────────────────
  server.tool(
    'validate_call_analysis',
    "[CONFIRMATION REQUIRED] Approves or edits the AI analysis of a call. The recruiter confirms the proposed record updates and tasks. You MUST ask for confirmation.",
    {
      validation_id: z.string().describe('UUID of the pending validation'),
      approve_updates: z.boolean().optional().default(true).describe('Apply the record updates'),
      approve_tasks: z.boolean().optional().default(true).describe('Create the proposed tasks'),
      field_corrections: z.record(z.string(), z.string()).optional().describe('Field corrections (e.g. { "salaire": "75k" })'),
    },
    wrapTool('validate_call_analysis', async (args, user) => {
      const validation = await prisma.aiPendingValidation.findUnique({
        where: { id: args.validation_id as string },
      });
      if (!validation) return { error: 'Validation not found' };
      if (validation.userId !== user.userId) return { error: 'Access denied' };

      const results: { updates_applied: string[]; tasks_created: string[] } = { updates_applied: [], tasks_created: [] };

      // Apply proposed updates to entity
      if (args.approve_updates !== false && validation.proposedUpdates && validation.entiteType && validation.entiteId) {
        const updates = (Array.isArray(validation.proposedUpdates) ? validation.proposedUpdates : []) as any[];
        const corrections = args.field_corrections as Record<string, string> | undefined;
        const updateObj: Record<string, string> = {};

        for (const u of updates) {
          const value = corrections?.[u.field] || u.suggested_value;
          updateObj[u.field] = value;
          results.updates_applied.push(`${u.label || u.field}: ${value}`);
        }

        if (Object.keys(updateObj).length > 0) {
          if (validation.entiteType === 'CANDIDAT') {
            await prisma.candidat.update({ where: { id: validation.entiteId }, data: updateObj as any });
          } else if (validation.entiteType === 'CLIENT') {
            await prisma.client.update({ where: { id: validation.entiteId }, data: updateObj as any });
          }
        }
      }

      // Create proposed tasks
      if (args.approve_tasks !== false && validation.proposedTasks) {
        const tasks = (Array.isArray(validation.proposedTasks) ? validation.proposedTasks : []) as any[];
        for (const task of tasks) {
          await prisma.activite.create({
            data: {
              type: 'TACHE',
              titre: task.title,
              contenu: task.description || '',
              isTache: true,
              tacheCompleted: false,
              tacheDueDate: task.deadline_hint ? new Date(task.deadline_hint) : null,
              entiteType: validation.entiteType as any,
              entiteId: validation.entiteId,
              userId: user.userId,
              source: 'AGENT_IA',
              metadata: { priority: task.priority === 'high' ? 'HAUTE' : task.priority === 'low' ? 'BASSE' : 'MOYENNE' },
            },
          });
          results.tasks_created.push(task.title);
        }
      }

      // Mark as validated
      await prisma.aiPendingValidation.update({
        where: { id: validation.id },
        data: {
          status: args.field_corrections ? 'modified' : 'validated',
          validatedAt: new Date(),
          modificationsJson: args.field_corrections ? args.field_corrections as any : undefined,
        },
      });

      return {
        success: true,
        updates_applied: results.updates_applied,
        tasks_created: results.tasks_created,
        message: `${results.updates_applied.length} update(s), ${results.tasks_created.length} task(s) created`,
      };
    }),
  );
}
