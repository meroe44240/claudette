import prisma from '../../lib/db.js';
import { NotFoundError, ConflictError, ValidationError } from '../../lib/errors.js';
import type { CreateCandidatureInput, UpdateCandidatureInput } from './candidature.schema.js';
import type { StageCandidature } from '@prisma/client';
import {
  notifyPresentation,
  notifyRdvClient,
  notifyCloseWon,
} from '../slack/slack.service.js';
import { logActivity } from '../../lib/activity-logger.js';
import { sendEmail, renderBrandedEmail } from '../../lib/mailer.js';

/**
 * Envoie un email au candidat (refus) et/ou au contact client du mandat
 * (notification presentation, refus, etc.) suite a un changement de stage,
 * si l'appelant l'a demande (flags notifyCandidate/notifyClient dans le
 * payload). Fire-and-forget — n'echoue pas la mutation si l'envoi echoue.
 *
 * Le corps utilise le meme wrapper brand que reset-password / recap.
 */
async function fireStageNotificationEmails(
  candidatureId: string,
  newStage: StageCandidature,
  opts: { notifyCandidate?: boolean; notifyClient?: boolean; messageToClient?: string },
): Promise<void> {
  if (!opts.notifyCandidate && !opts.notifyClient) return;

  const c = await prisma.candidature.findUnique({
    where: { id: candidatureId },
    include: {
      candidat: { select: { email: true, prenom: true, nom: true } },
      mandat: {
        select: {
          titrePoste: true,
          entreprise: { select: { nom: true } },
          client: { select: { email: true, prenom: true, nom: true } },
        },
      },
    },
  });
  if (!c) return;

  const candidatName = [c.candidat.prenom, c.candidat.nom].filter(Boolean).join(' ').trim();
  const mandatLabel = `${c.mandat.entreprise?.nom ?? ''} — ${c.mandat.titrePoste}`.trim();

  // Email au candidat (refus)
  if (opts.notifyCandidate && newStage === 'REFUSE' && c.candidat.email) {
    const prenom = c.candidat.prenom || c.candidat.nom;
    try {
      await sendEmail(
        c.candidat.email,
        `Votre candidature pour ${c.mandat.titrePoste}`,
        renderBrandedEmail({
          title: 'Votre candidature',
          bodyHtml: `
            <p>Bonjour ${prenom},</p>
            <p>Merci pour l'intérêt que vous avez porté au poste de <strong>${c.mandat.titrePoste}</strong> chez <strong>${c.mandat.entreprise?.nom ?? 'notre client'}</strong>.</p>
            <p>Après échange avec l'entreprise, votre profil n'a pas été retenu à ce stade. Ce n'est jamais une décision facile à annoncer — nous gardons votre profil en base et reviendrons vers vous si une opportunité mieux alignée se présente.</p>
            <p>Nous vous souhaitons le meilleur pour la suite.</p>
          `,
          signature: `L'équipe HumanUp`,
        }),
      );
    } catch (err) {
      console.error(`[candidature] email candidat REFUSE failed for ${c.candidat.email}:`, err);
    }
  }

  // Email au contact client (notification presentation / refus / autres)
  if (opts.notifyClient && c.mandat.client?.email) {
    const prenom = c.mandat.client.prenom || c.mandat.client.nom;
    const subject = newStage === 'ENVOYE_CLIENT'
      ? `Nouveau profil pour ${c.mandat.titrePoste}`
      : `Mise à jour candidature — ${c.mandat.titrePoste}`;
    const body = newStage === 'ENVOYE_CLIENT'
      ? `<p>Bonjour ${prenom},</p><p>Nous vous présentons <strong>${candidatName}</strong> pour le poste de <strong>${c.mandat.titrePoste}</strong>.</p>`
      : `<p>Bonjour ${prenom},</p><p>Le candidat <strong>${candidatName}</strong> sur le mandat <strong>${mandatLabel}</strong> a été marqué comme <strong>${newStage.toLowerCase().replace('_', ' ')}</strong>.</p>`;
    const userMessage = opts.messageToClient
      ? `<p style="border-left:3px solid #E6E9AF;padding-left:12px;margin:16px 0;color:#4a4568;">${escapeHtmlLite(opts.messageToClient)}</p>`
      : '';
    try {
      await sendEmail(
        c.mandat.client.email,
        subject,
        renderBrandedEmail({
          title: subject,
          bodyHtml: body + userMessage,
          signature: `L'équipe HumanUp`,
        }),
      );
    } catch (err) {
      console.error(`[candidature] email client failed for ${c.mandat.client.email}:`, err);
    }
  }
}

function escapeHtmlLite(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

/**
 * Fetch full context for a candidature (candidat, mandat, entreprise, client, recruteur)
 * and fire the appropriate Slack notification based on the new stage.
 * All calls are fire-and-forget so they never block mutations.
 */
async function fireSlackStageNotification(
  candidatureId: string,
  newStage: string,
  dateEntretienClient?: Date | null,
): Promise<void> {
  const candidature = await prisma.candidature.findUnique({
    where: { id: candidatureId },
    include: {
      candidat: { select: { nom: true, prenom: true } },
      mandat: {
        include: {
          entreprise: { select: { nom: true } },
          client: { select: { nom: true, prenom: true } },
          assignedTo: { select: { prenom: true } },
        },
      },
    },
  });
  if (!candidature) return;

  const { candidat, mandat } = candidature;
  const contactNom = mandat.client
    ? [mandat.client.prenom, mandat.client.nom].filter(Boolean).join(' ')
    : null;

  if (newStage === 'ENTRETIEN_CLIENT') {
    await notifyPresentation({
      candidatPrenom: candidat.prenom,
      candidatNom: candidat.nom,
      entrepriseNom: mandat.entreprise?.nom || 'N/A',
      contactNom,
      mandatTitre: mandat.titrePoste,
      recruteurPrenom: mandat.assignedTo?.prenom || null,
      // Prefer the explicit client-interview date if set, else today.
      date: dateEntretienClient || candidature.dateEntretienClient || null,
    });
  } else if (newStage === 'ENTRETIEN_1') {
    await notifyRdvClient({
      candidatPrenom: candidat.prenom,
      candidatNom: candidat.nom,
      entrepriseNom: mandat.entreprise?.nom || 'N/A',
      contactNom,
      mandatTitre: mandat.titrePoste,
      dateEntretien: dateEntretienClient || candidature.dateEntretienClient || null,
      recruteurPrenom: mandat.assignedTo?.prenom || null,
    });
  } else if (newStage === 'PLACE') {
    await notifyCloseWon({
      candidatPrenom: candidat.prenom,
      candidatNom: candidat.nom,
      entrepriseNom: mandat.entreprise?.nom || 'N/A',
      contactNom,
      mandatTitre: mandat.titrePoste,
      feeMontant: mandat.feeMontantFacture || mandat.feeMontantEstime || null,
      dateDemarrage: candidature.dateDemarrage || null,
      sourcePlacement: candidature.sourcePlacement || null,
      sourceLead: mandat.sourceLead || null,
      recruteurPrenom: mandat.assignedTo?.prenom || null,
    });
  }
}

export async function list(filters: {
  mandatId?: string;
  stage?: StageCandidature;
  include?: string;
}) {
  const where: any = {};
  if (filters.mandatId) where.mandatId = filters.mandatId;
  if (filters.stage) where.stage = filters.stage;

  const candidatures = await prisma.candidature.findMany({
    where,
    include: {
      candidat: filters.include === 'candidat' ? {
        select: {
          id: true,
          nom: true,
          prenom: true,
          email: true,
          telephone: true,
          posteActuel: true,
          entrepriseActuelle: true,
          linkedinUrl: true,
          localisation: true,
          tags: true,
          source: true,
          anneesExperience: true,
          aiPitchShort: true,
        },
      } : false,
      mandat: {
        select: { id: true, titrePoste: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return { data: candidatures };
}

export async function create(data: CreateCandidatureInput, createdById: string) {
  // Check for duplicate (mandatId + candidatId must be unique)
  const existing = await prisma.candidature.findUnique({
    where: {
      mandatId_candidatId: {
        mandatId: data.mandatId,
        candidatId: data.candidatId,
      },
    },
  });

  if (existing) {
    throw new ConflictError('Ce candidat est deja associe a ce mandat');
  }

  // Create candidature with initial stage history entry
  const candidature = await prisma.candidature.create({
    data: {
      mandatId: data.mandatId,
      candidatId: data.candidatId,
      stage: data.stage,
      notes: data.notes,
      createdById,
    },
  });

  // Create initial StageHistory entry
  await prisma.stageHistory.create({
    data: {
      candidatureId: candidature.id,
      fromStage: null,
      toStage: data.stage,
      changedById: createdById,
    },
  });

  // Fire-and-forget: log "candidat added to mandat" activity
  prisma.mandat
    .findUnique({ where: { id: data.mandatId }, select: { titrePoste: true } })
    .then((mandat) => {
      const titre = mandat?.titrePoste || data.mandatId;
      logActivity({
        type: 'NOTE',
        entiteType: 'CANDIDAT',
        entiteId: data.candidatId,
        userId: createdById,
        titre: `Ajouté au mandat ${titre}`,
        source: 'SYSTEME',
        metadata: { candidatureId: candidature.id, mandatId: data.mandatId },
      });
    })
    .catch(() => {});

  // If the candidature is created DIRECTLY at an advanced stage
  // (ENTRETIEN_1 / ENTRETIEN_CLIENT / PLACE), fire the matching Slack notif —
  // this happens e.g. when a recruiter drops a candidat straight into the
  // client-interview column of the kanban.
  if (['ENTRETIEN_1', 'ENTRETIEN_CLIENT', 'PLACE'].includes(data.stage)) {
    fireSlackStageNotification(candidature.id, data.stage, null).catch(() => {});
  }

  return candidature;
}

export async function update(id: string, data: UpdateCandidatureInput, changedById: string) {
  const existing = await prisma.candidature.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Candidature', id);

  // If stage is REFUSE, require motifRefus
  if (data.stage === 'REFUSE' && !data.motifRefus && !existing.motifRefus) {
    throw new ValidationError('Le motif de refus est requis lorsque le stage est REFUSE');
  }

  // Passing to PLACE (close-won) requires the definitive invoice amount and
  // start date. The UI modal and the MCP move_candidate_stage tool already
  // enforce this — the service check is defense in depth so any other caller
  // (raw API request, batch script, future integration) cannot silently
  // create half-populated placements that then leak into KPIs.
  if (data.stage === 'PLACE' && existing.stage !== 'PLACE') {
    if (data.feeMontantFacture === undefined || data.feeMontantFacture === null) {
      throw new ValidationError('Le montant de la facture est requis pour passer une candidature en PLACE (close won).');
    }
    if (data.dateDemarrage === undefined || data.dateDemarrage === null) {
      throw new ValidationError('La date de démarrage est requise pour passer une candidature en PLACE (close won).');
    }
  }

  const updateData: any = {};

  if (data.stage !== undefined) updateData.stage = data.stage;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.motifRefus !== undefined) updateData.motifRefus = data.motifRefus;
  if (data.motifRefusDetail !== undefined) updateData.motifRefusDetail = data.motifRefusDetail;
  if (data.datePresentation !== undefined) updateData.datePresentation = new Date(data.datePresentation);
  if (data.dateEntretienClient !== undefined) updateData.dateEntretienClient = new Date(data.dateEntretienClient);
  if (data.dateDemarrage !== undefined) updateData.dateDemarrage = new Date(data.dateDemarrage);
  if (data.sourcePlacement !== undefined) updateData.sourcePlacement = data.sourcePlacement;

  // When closing won (PLACE), write the definitive fee + invoice status +
  // mandat lead source on the mandat in the same transaction as the
  // candidature update.
  const isPlacement =
    data.stage === 'PLACE' &&
    (data.feeMontantFacture !== undefined || data.sourceLead !== undefined);

  const candidature = isPlacement
    ? await prisma.$transaction(async (tx) => {
        const updated = await tx.candidature.update({ where: { id }, data: updateData });
        const mandatUpdate: any = {};
        if (data.feeMontantFacture !== undefined) {
          mandatUpdate.feeMontantFacture = data.feeMontantFacture;
          mandatUpdate.feeStatut = 'FACTURE';
        }
        if (data.sourceLead !== undefined) {
          mandatUpdate.sourceLead = data.sourceLead;
        }
        await tx.mandat.update({ where: { id: existing.mandatId }, data: mandatUpdate });
        return updated;
      })
    : await prisma.candidature.update({ where: { id }, data: updateData });

  // If stage changed, create StageHistory entry
  if (data.stage && data.stage !== existing.stage) {
    await prisma.stageHistory.create({
      data: {
        candidatureId: id,
        fromStage: existing.stage as StageCandidature,
        toStage: data.stage as StageCandidature,
        changedById,
      },
    });

    // Log activity for stage change (audit trail)
    const stageLabels: Record<string, string> = {
      SOURCING: 'Sourcing', CONTACTE: 'Contacté', ENTRETIEN_1: 'Entretien 1',
      ENVOYE_CLIENT: 'Envoyé client', ENTRETIEN_CLIENT: 'Entretien Client',
      SHORTLIST: 'Shortlist', OFFRE: 'Offre', PLACE: 'Placé', REFUSE: 'Refusé',
    };
    await prisma.activite.create({
      data: {
        type: 'NOTE',
        titre: `Pipeline : ${stageLabels[existing.stage] || existing.stage} → ${stageLabels[data.stage as string] || data.stage}`,
        entiteType: 'CANDIDAT',
        entiteId: existing.candidatId,
        userId: changedById,
        source: 'SYSTEME',
        metadata: { stageChange: true, candidatureId: id, mandatId: existing.mandatId, fromStage: existing.stage, toStage: data.stage },
      },
    });

    // Auto-create follow-up tasks based on stage
    const stageTaskMap: Record<string, string[]> = {
      'CONTACTE': ['Préparer le brief candidat'],
      'ENTRETIEN': ['Préparer le candidat pour l\'entretien', 'Confirmer la date d\'entretien'],
      'ENVOYE_CLIENT': ['Relancer le client pour avoir un retour'],
      'ENTRETIEN_CLIENT': ['Envoyer le brief au client', 'Préparer le candidat pour le client'],
      'SHORTLIST': ['Envoyer la shortlist au client'],
      'OFFRE': ['Négocier les conditions', 'Préparer le contrat'],
      'PLACE': ['Planifier le check-in à 1 mois', 'Envoyer la facturation'],
    };

    const tasksToCreate = stageTaskMap[data.stage as string] || [];
    for (const taskTitle of tasksToCreate) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3); // Default: 3 days
      await prisma.activite.create({
        data: {
          type: 'TACHE',
          isTache: true,
          tacheCompleted: false,
          titre: taskTitle,
          entiteType: 'CANDIDAT',
          entiteId: existing.candidatId,
          userId: changedById,
          source: 'SYSTEME',
          tacheDueDate: dueDate,
          metadata: { autoCreated: true, candidatureId: id, mandatId: existing.mandatId, triggerStage: data.stage },
        },
      });
    }

    // Fire-and-forget Slack notification for key stage changes
    const dateEntretien = data.dateEntretienClient ? new Date(data.dateEntretienClient) : null;
    fireSlackStageNotification(id, data.stage, dateEntretien).catch(() => {});

    // Fire-and-forget email notifications (candidat refuse + client) si demande
    fireStageNotificationEmails(id, data.stage as StageCandidature, {
      notifyCandidate: data.notifyCandidate,
      notifyClient: data.notifyClient,
      messageToClient: data.messageToClient,
    }).catch(() => {});
  }

  return candidature;
}

export async function remove(id: string) {
  const existing = await prisma.candidature.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Candidature', id);

  // StageHistory will be cascade-deleted due to onDelete: Cascade in schema
  return prisma.candidature.delete({ where: { id } });
}

export async function getHistory(id: string) {
  const existing = await prisma.candidature.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Candidature', id);

  return prisma.stageHistory.findMany({
    where: { candidatureId: id },
    orderBy: { changedAt: 'desc' },
  });
}

export async function bulkUpdateStage(
  ids: string[],
  stage: string,
  changedById: string,
  motifRefus?: string,
  motifRefusDetail?: string,
  notif?: { notifyClient?: boolean; messageToClient?: string },
) {
  if (stage === 'REFUSE' && !motifRefus) {
    throw new ValidationError('Le motif de refus est requis pour le stage REFUSE');
  }

  // Bulk PLACE isn't supported: each placement needs its own fee + start date
  // (enforced by the modal + move_candidate_stage). Reject the whole batch
  // upfront rather than half-write placements without those values.
  if (stage === 'PLACE') {
    throw new ValidationError('Impossible de passer plusieurs candidatures en PLACE en batch : chaque placement doit renseigner le montant facturé et la date de démarrage. Utilise le modal individuel.');
  }

  const results = [];
  for (const id of ids) {
    const existing = await prisma.candidature.findUnique({ where: { id } });
    if (!existing) continue;
    if (existing.stage === stage) continue;

    const updateData: any = { stage };
    if (motifRefus) updateData.motifRefus = motifRefus;
    if (motifRefusDetail) updateData.motifRefusDetail = motifRefusDetail;

    const updated = await prisma.candidature.update({
      where: { id },
      data: updateData,
    });

    await prisma.stageHistory.create({
      data: {
        candidatureId: id,
        fromStage: existing.stage as StageCandidature,
        toStage: stage as StageCandidature,
        changedById,
      },
    });

    // Auto-create activity for stage change
    await prisma.activite.create({
      data: {
        type: 'NOTE',
        titre: `Stage changé: ${existing.stage} → ${stage}`,
        entiteType: 'CANDIDAT',
        entiteId: existing.candidatId,
        userId: changedById,
        source: 'SYSTEME',
        metadata: { stageChange: true, candidatureId: id, mandatId: existing.mandatId, fromStage: existing.stage, toStage: stage },
      },
    });

    // Fire-and-forget Slack notification for key stage changes
    fireSlackStageNotification(id, stage, null).catch(() => {});

    results.push(updated);
  }

  // Email agrege au client si demande (typique : "Présenter au client" =
  // bulk-move vers ENVOYE_CLIENT). Un seul mail avec la liste des candidats,
  // pas N mails individuels.
  if (notif?.notifyClient && results.length > 0) {
    fireBulkClientNotification(results.map((r) => r.id), stage as StageCandidature, notif.messageToClient)
      .catch((err) => console.error('[candidature] bulk email client failed:', err));
  }

  return { updated: results.length, results };
}

/**
 * Envoie UN seul email au contact client du mandat listant tous les candidats
 * concernes par un bulk stage change. Suppose que toutes les candidatures
 * appartiennent au meme mandat (cas typique du kanban : "Présenter au client").
 * Si plusieurs mandats sont touches, un email par mandat.
 */
async function fireBulkClientNotification(
  candidatureIds: string[],
  stage: StageCandidature,
  messageToClient?: string,
): Promise<void> {
  const rows = await prisma.candidature.findMany({
    where: { id: { in: candidatureIds } },
    include: {
      candidat: { select: { nom: true, prenom: true } },
      mandat: {
        select: {
          titrePoste: true,
          entreprise: { select: { nom: true } },
          client: { select: { email: true, prenom: true, nom: true } },
        },
      },
    },
  });

  // Group by mandat (au cas ou)
  const byMandat = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.mandatId;
    if (!byMandat.has(key)) byMandat.set(key, []);
    byMandat.get(key)!.push(r);
  }

  for (const list of byMandat.values()) {
    if (list.length === 0) continue;
    const first = list[0];
    if (!first.mandat.client?.email) continue;

    const prenom = first.mandat.client.prenom || first.mandat.client.nom;
    const listHtml = list
      .map((c) => `<li>${escapeHtmlLite([c.candidat.prenom, c.candidat.nom].filter(Boolean).join(' '))}</li>`)
      .join('');
    const subject = stage === 'ENVOYE_CLIENT'
      ? `${list.length} profil${list.length > 1 ? 's' : ''} à découvrir — ${first.mandat.titrePoste}`
      : `Mise à jour candidatures — ${first.mandat.titrePoste}`;
    const userMessage = messageToClient
      ? `<p style="border-left:3px solid #E6E9AF;padding-left:12px;margin:16px 0;color:#4a4568;">${escapeHtmlLite(messageToClient)}</p>`
      : '';

    try {
      await sendEmail(
        first.mandat.client.email,
        subject,
        renderBrandedEmail({
          title: subject,
          bodyHtml: `
            <p>Bonjour ${prenom},</p>
            <p>Voici ${list.length > 1 ? 'les profils' : 'le profil'} que nous vous présentons pour le poste <strong>${first.mandat.titrePoste}</strong> chez <strong>${first.mandat.entreprise?.nom ?? 'vous'}</strong> :</p>
            <ul style="margin:12px 0;padding-left:20px;">${listHtml}</ul>
            <p>Le détail des CV est accessible depuis votre portail HumanUp.</p>
            ${userMessage}
          `,
          signature: `L'équipe HumanUp`,
        }),
      );
    } catch (err) {
      console.error(`[candidature] bulk email client failed for ${first.mandat.client.email}:`, err);
    }
  }
}
