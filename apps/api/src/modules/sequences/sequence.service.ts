import prisma from '../../lib/db.js';
import { NotFoundError } from '../../lib/errors.js';

// ─── TYPES ──────────────────────────────────────────

export interface SequenceStep {
  order: number;
  delay_days: number;
  delay_hours: number;
  channel: 'email' | 'call' | 'whatsapp';
  action: 'send' | 'call' | 'message';
  template: {
    subject?: string;
    body?: string;
    whatsapp_message?: string;
  };
  task_title: string;
  instructions?: string;
}

// ─── CRUD ───────────────────────────────────────────

export async function list(userId?: string) {
  const sequences = await prisma.sequence.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { runs: true } },
      createdBy: { select: { nom: true, prenom: true } },
    },
  });

  return sequences.map(s => ({
    ...s,
    steps: s.steps as unknown as SequenceStep[],
    totalRuns: s._count.runs,
  }));
}

export async function getById(id: string) {
  const sequence = await prisma.sequence.findUnique({
    where: { id },
    include: {
      runs: {
        orderBy: { startedAt: 'desc' },
        take: 20,
        include: {
          stepLogs: { orderBy: { stepOrder: 'asc' } },
        },
      },
      createdBy: { select: { nom: true, prenom: true } },
    },
  });

  if (!sequence) throw new NotFoundError('Sequence', id);

  return {
    ...sequence,
    steps: sequence.steps as unknown as SequenceStep[],
  };
}

export async function create(data: {
  nom: string;
  description?: string;
  persona?: string;
  targetType: string;
  steps: SequenceStep[];
  stopOnReply?: boolean;
  userId: string;
}) {
  return prisma.sequence.create({
    data: {
      nom: data.nom,
      description: data.description,
      persona: data.persona,
      targetType: data.targetType,
      steps: data.steps as any,
      stopOnReply: data.stopOnReply ?? true,
      createdById: data.userId,
    },
  });
}

export async function update(id: string, data: {
  nom?: string;
  description?: string;
  persona?: string;
  targetType?: string;
  steps?: SequenceStep[];
  stopOnReply?: boolean;
  isActive?: boolean;
}) {
  const existing = await prisma.sequence.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Sequence', id);

  return prisma.sequence.update({
    where: { id },
    data: {
      nom: data.nom,
      description: data.description,
      persona: data.persona,
      targetType: data.targetType,
      steps: data.steps ? (data.steps as any) : undefined,
      stopOnReply: data.stopOnReply,
      isActive: data.isActive,
    },
  });
}

export async function remove(id: string) {
  const existing = await prisma.sequence.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Sequence', id);

  await prisma.sequence.delete({ where: { id } });
  return { success: true };
}

// ─── RUN MANAGEMENT ─────────────────────────────────

export async function startRun(data: {
  sequenceId: string;
  targetType: string;
  targetId: string;
  mandatId?: string;
  assignedToId?: string;
  metadata?: Record<string, string>;
}) {
  const sequence = await prisma.sequence.findUnique({ where: { id: data.sequenceId } });
  if (!sequence) throw new NotFoundError('Sequence', data.sequenceId);

  const steps = sequence.steps as unknown as SequenceStep[];
  const firstStep = steps[0];

  const now = new Date();
  const nextActionAt = new Date(now);
  if (firstStep) {
    nextActionAt.setDate(nextActionAt.getDate() + firstStep.delay_days);
    nextActionAt.setHours(nextActionAt.getHours() + (firstStep.delay_hours || 0));
  }

  // Enrich metadata with booking links
  const meta = { ...(data.metadata ?? {}) };
  if (data.assignedToId) {
    const bookingSettings = await prisma.bookingSetting.findUnique({
      where: { userId: data.assignedToId },
      select: { slug: true, isActive: true },
    });
    if (bookingSettings?.isActive && bookingSettings.slug) {
      meta.bookingLink = `https://ats.propium.co/book/${bookingSettings.slug}`;
      if (data.mandatId) {
        const mandat = await prisma.mandat.findUnique({
          where: { id: data.mandatId },
          select: { slug: true },
        });
        if (mandat?.slug) {
          meta.bookingLinkMandate = `https://ats.propium.co/book/${bookingSettings.slug}/${mandat.slug}`;
        }
      }
    }
  }

  const run = await prisma.sequenceRun.create({
    data: {
      sequenceId: data.sequenceId,
      targetType: data.targetType,
      targetId: data.targetId,
      mandatId: data.mandatId,
      assignedToId: data.assignedToId,
      currentStep: 0,
      status: 'running',
      nextActionAt,
      metadata: Object.keys(meta).length > 0 ? meta : undefined,
    },
    include: {
      sequence: { select: { nom: true } },
    },
  });

  return run;
}

export async function pauseRun(runId: string) {
  return prisma.sequenceRun.update({
    where: { id: runId },
    data: { status: 'paused_reply' },
  });
}

export async function resumeRun(runId: string) {
  return prisma.sequenceRun.update({
    where: { id: runId },
    data: { status: 'running' },
  });
}

export async function cancelRun(runId: string) {
  return prisma.sequenceRun.update({
    where: { id: runId },
    data: { status: 'cancelled' },
  });
}

export async function getActiveRuns() {
  return prisma.sequenceRun.findMany({
    where: { status: { in: ['running', 'paused_reply'] } },
    include: {
      sequence: { select: { nom: true, targetType: true, persona: true } },
      stepLogs: { orderBy: { stepOrder: 'asc' } },
    },
    orderBy: { startedAt: 'desc' },
  });
}

export async function getCompletedRuns() {
  return prisma.sequenceRun.findMany({
    where: { status: { in: ['completed', 'cancelled'] } },
    include: {
      sequence: { select: { nom: true, targetType: true, persona: true } },
      stepLogs: { orderBy: { stepOrder: 'asc' } },
    },
    orderBy: { startedAt: 'desc' },
    take: 50,
  });
}

// ─── STEP EXECUTION ─────────────────────────────────

export async function executeNextStep(runId: string) {
  const run = await prisma.sequenceRun.findUnique({
    where: { id: runId },
    include: { sequence: true },
  });

  if (!run || run.status !== 'running') return null;

  const steps = run.sequence.steps as unknown as SequenceStep[];
  const currentStep = steps[run.currentStep];

  if (!currentStep) {
    await prisma.sequenceRun.update({
      where: { id: runId },
      data: { status: 'completed' },
    });
    return { status: 'completed' };
  }

  // Create a TASK for this step — the recruiter will validate/execute it
  const taskTitle = resolveVariables(currentStep.task_title, run);
  const task = await prisma.activite.create({
    data: {
      type: 'TACHE',
      isTache: true,
      tacheCompleted: false,
      entiteType: run.targetType === 'candidate' ? 'CANDIDAT' : 'CLIENT',
      entiteId: run.targetId,
      userId: run.assignedToId,
      titre: taskTitle,
      contenu: currentStep.instructions ? resolveVariables(currentStep.instructions, run) : undefined,
      source: 'SYSTEME',
      tacheDueDate: new Date(),
      metadata: {
        sequenceId: run.sequenceId,
        sequenceRunId: run.id,
        sequenceName: run.sequence.nom,
        stepOrder: run.currentStep,
        channel: currentStep.channel,
        template: currentStep.template ? {
          subject: currentStep.template.subject ? resolveVariables(currentStep.template.subject, run) : undefined,
          body: currentStep.template.body ? resolveVariables(currentStep.template.body, run) : undefined,
          whatsapp_message: currentStep.template.whatsapp_message ? resolveVariables(currentStep.template.whatsapp_message, run) : undefined,
        } : undefined,
        priority: 'HAUTE',
        isSequenceTask: true,
      },
    },
  });

  // Log the step
  await prisma.sequenceStepLog.create({
    data: {
      sequenceRunId: runId,
      stepOrder: run.currentStep,
      actionType: currentStep.action,
      channel: currentStep.channel,
      status: 'task_created',
      taskId: task.id,
      executedAt: new Date(),
      result: { taskId: task.id, taskTitle } as any,
    },
  });

  // Schedule next step
  const nextStepIndex = run.currentStep + 1;
  const nextStep = steps[nextStepIndex];

  if (nextStep) {
    const nextActionAt = new Date();
    nextActionAt.setDate(nextActionAt.getDate() + nextStep.delay_days);
    nextActionAt.setHours(nextActionAt.getHours() + (nextStep.delay_hours || 0));

    await prisma.sequenceRun.update({
      where: { id: runId },
      data: { currentStep: nextStepIndex, nextActionAt },
    });
  } else {
    await prisma.sequenceRun.update({
      where: { id: runId },
      data: { status: 'completed', currentStep: nextStepIndex },
    });
  }

  return { status: 'task_created', stepOrder: run.currentStep, taskId: task.id };
}

// ─── VALIDATE STEP (recruiter marks step as done) ───

export async function validateStep(stepLogId: string) {
  const stepLog = await prisma.sequenceStepLog.findUnique({
    where: { id: stepLogId },
    include: { sequenceRun: { include: { sequence: true } } },
  });

  if (!stepLog) throw new NotFoundError('StepLog', stepLogId);

  await prisma.sequenceStepLog.update({
    where: { id: stepLogId },
    data: { status: 'validated', executedAt: new Date() },
  });

  // Mark the associated task as completed
  if (stepLog.taskId) {
    await prisma.activite.update({
      where: { id: stepLog.taskId },
      data: { tacheCompleted: true },
    });
  }

  return { success: true };
}

// ─── REPLY DETECTION ────────────────────────────────

export async function detectReply(contactEmail: string) {
  // Find active sequence runs targeting this contact
  const activeRuns = await prisma.sequenceRun.findMany({
    where: { status: 'running' },
    include: { sequence: true },
  });

  const results = [];

  for (const run of activeRuns) {
    if (!run.sequence.stopOnReply) continue;

    // Check if the target matches by looking up email
    let targetEmail: string | null = null;
    if (run.targetType === 'candidate') {
      const candidat = await prisma.candidat.findUnique({ where: { id: run.targetId }, select: { email: true } });
      targetEmail = candidat?.email ?? null;
    } else {
      const client = await prisma.client.findUnique({ where: { id: run.targetId }, select: { email: true } });
      targetEmail = client?.email ?? null;
    }

    if (targetEmail && targetEmail.toLowerCase() === contactEmail.toLowerCase()) {
      // Pause the sequence
      await prisma.sequenceRun.update({
        where: { id: run.id },
        data: { status: 'paused_reply' },
      });

      // Mark current step log as reply_detected
      const currentLog = await prisma.sequenceStepLog.findFirst({
        where: { sequenceRunId: run.id, stepOrder: run.currentStep },
      });
      if (currentLog) {
        await prisma.sequenceStepLog.update({
          where: { id: currentLog.id },
          data: { status: 'reply_detected', responseDetectedAt: new Date() },
        });
      }

      // Create notification
      const meta = (run.metadata ?? {}) as Record<string, string>;
      await prisma.notification.create({
        data: {
          userId: run.assignedToId || '',
          type: 'SYSTEME',
          titre: `${meta.contactName || 'Contact'} a répondu ! Séquence "${run.sequence.nom}" en pause.`,
          contenu: `Réponse détectée par email. La séquence a été automatiquement mise en pause.`,
          entiteType: run.targetType === 'candidate' ? 'CANDIDAT' : 'CLIENT',
          entiteId: run.targetId,
        },
      });

      // Create urgent task
      if (run.assignedToId) {
        await prisma.activite.create({
          data: {
            type: 'TACHE',
            isTache: true,
            tacheCompleted: false,
            entiteType: run.targetType === 'candidate' ? 'CANDIDAT' : 'CLIENT',
            entiteId: run.targetId,
            userId: run.assignedToId,
            titre: `Traiter la réponse de ${meta.contactName || 'contact'}`,
            source: 'SYSTEME',
            tacheDueDate: new Date(),
            metadata: { priority: 'URGENTE', isSequenceReply: true, sequenceRunId: run.id },
          },
        });
      }

      results.push({ runId: run.id, sequenceName: run.sequence.nom, paused: true });
    }
  }

  return results;
}

// ─── VARIABLE RESOLUTION ────────────────────────────

function resolveVariables(template: string, run: any): string {
  const meta = (run.metadata ?? {}) as Record<string, string>;

  return template
    .replace(/\{\{first_name\}\}/g, meta.firstName ?? meta.contactName?.split(' ')[0] ?? '')
    .replace(/\{\{contact_name\}\}/g, meta.contactName ?? '')
    .replace(/\{\{candidate_name\}\}/g, meta.contactName ?? '')
    .replace(/\{\{candidate_email\}\}/g, meta.contactEmail ?? '')
    .replace(/\{\{client_name\}\}/g, meta.contactName ?? '')
    .replace(/\{\{client_email\}\}/g, meta.contactEmail ?? '')
    .replace(/\{\{company_name\}\}/g, meta.companyName ?? '')
    .replace(/\{\{current_company\}\}/g, meta.currentCompany ?? '')
    .replace(/\{\{mandate_title\}\}/g, meta.mandateTitle ?? '')
    .replace(/\{\{mandate_fee\}\}/g, meta.mandateFee ?? '')
    .replace(/\{\{user_name\}\}/g, meta.userName ?? '')
    .replace(/\{\{booking_link\}\}/g, meta.bookingLink ?? '')
    .replace(/\{\{booking_link_mandate\}\}/g, meta.bookingLinkMandate ?? '');
}

// ─── PROCESS DUE RUNS (cron) ────────────────────────

export async function processDueRuns() {
  const now = new Date();

  const dueRuns = await prisma.sequenceRun.findMany({
    where: {
      status: 'running',
      nextActionAt: { lte: now },
    },
  });

  const results = [];
  for (const run of dueRuns) {
    try {
      const result = await executeNextStep(run.id);
      results.push({ runId: run.id, ...result });
    } catch (error) {
      results.push({ runId: run.id, error: String(error) });
    }
  }

  return results;
}

// ─── SEED DEFAULT SEQUENCES (4 persona-based) ───────

export async function seedDefaultSequences(userId: string) {
  // Delete existing and recreate
  await prisma.sequenceStepLog.deleteMany();
  await prisma.sequenceRun.deleteMany();
  await prisma.sequence.deleteMany();

  const defaults = [
    // 1. Candidat passif — Tech/SaaS
    {
      nom: 'Candidat passif — Tech/SaaS',
      description: 'Séquence multicanal pour approcher des candidats passifs dans le secteur Tech/SaaS. 6 étapes sur 14 jours.',
      persona: 'Candidat passif Tech',
      targetType: 'candidate',
      stopOnReply: true,
      steps: [
        { order: 0, delay_days: 0, delay_hours: 0, channel: 'email', action: 'send', template: { subject: '{{first_name}}, une opportunité {{mandate_title}} qui pourrait vous intéresser', body: 'Bonjour {{first_name}},\n\nJe me permets de vous contacter car votre parcours chez {{current_company}} a retenu mon attention.\n\nNous accompagnons {{company_name}} dans le recrutement d\'un(e) {{mandate_title}}. Le poste offre un cadre stimulant et des perspectives intéressantes.\n\nSeriez-vous disponible pour un échange rapide de 15 minutes cette semaine ?\n\nCordialement' }, task_title: '📧 Envoyer email approche à {{contact_name}} — {{mandate_title}}', instructions: 'Personnaliser le premier paragraphe en mentionnant son poste actuel chez {{current_company}}' },
        { order: 1, delay_days: 2, delay_hours: 0, channel: 'call', action: 'call', template: {}, task_title: '📞 Appeler {{contact_name}} — suivi email approche', instructions: 'Référencer l\'email envoyé. Pitch 30sec: présenter le poste, l\'entreprise, la fourchette salariale.' },
        { order: 2, delay_days: 4, delay_hours: 0, channel: 'whatsapp', action: 'message', template: { whatsapp_message: 'Bonjour {{first_name}}, je vous ai contacté par email et par téléphone concernant un poste de {{mandate_title}} chez {{company_name}}. Seriez-vous disponible pour un échange rapide cette semaine ?' }, task_title: '💬 WhatsApp relance {{contact_name}}', instructions: 'Message court et direct. Ne pas re-pitcher le poste.' },
        { order: 3, delay_days: 7, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Re: {{mandate_title}} — quelques précisions', body: 'Bonjour {{first_name}},\n\nJe me permets de revenir vers vous avec quelques précisions sur le poste de {{mandate_title}} chez {{company_name}} :\n\n- Équipe en forte croissance\n- Rémunération attractive + variable\n- Flexibilité télétravail\n\nJe serais ravi d\'en discuter à votre convenance.\n\nCordialement' }, task_title: '📧 Envoyer relance email à {{contact_name}}', instructions: 'Ajouter des infos concrètes sur le salaire et les avantages' },
        { order: 4, delay_days: 10, delay_hours: 0, channel: 'call', action: 'call', template: {}, task_title: '📞 Dernier appel {{contact_name}} — clôturer la séquence', instructions: 'Si pas de réponse, passer le candidat en "Pas intéressé / No answer"' },
        { order: 5, delay_days: 14, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Je ne vous dérangerai plus — {{first_name}}', body: 'Bonjour {{first_name}},\n\nJe comprends que le timing n\'est peut-être pas idéal. Je ne vous solliciterai plus sur ce sujet.\n\nSi votre situation évolue, n\'hésitez pas à me recontacter. Je reste disponible.\n\nBelle continuation,\n{{user_name}}' }, task_title: '📧 Breakup email à {{contact_name}}', instructions: 'Email final poli. Laisser la porte ouverte.' },
      ],
    },
    // 2. DRH / Hiring Manager — Business Dev
    {
      nom: 'DRH / Hiring Manager — Business Dev',
      description: 'Séquence de prospection commerciale pour les DRH et Hiring Managers de grands groupes. 6 étapes sur 14 jours.',
      persona: 'DRH Grand Groupe',
      targetType: 'client',
      stopOnReply: true,
      steps: [
        { order: 0, delay_days: 0, delay_hours: 0, channel: 'email', action: 'send', template: { subject: '{{first_name}}, comment recrutez-vous vos profils commerciaux ?', body: 'Bonjour {{first_name}},\n\nJe me permets de vous contacter car nous accompagnons des entreprises comme {{company_name}} dans le recrutement de profils commerciaux seniors.\n\nNotre approche : un sourcing ciblé, des candidats pré-qualifiés, et un engagement au résultat.\n\nSeriez-vous disponible pour un appel de 15 minutes ?\n\nCordialement,\n{{user_name}}' }, task_title: '📧 Envoyer email intro commerciale à {{contact_name}}', instructions: 'Personnaliser en mentionnant le secteur de l\'entreprise' },
        { order: 1, delay_days: 2, delay_hours: 0, channel: 'call', action: 'call', template: {}, task_title: '📞 Appel de découverte — {{contact_name}}', instructions: 'Objectif : qualifier le besoin. Demander les recrutements en cours et à venir.' },
        { order: 2, delay_days: 5, delay_hours: 0, channel: 'whatsapp', action: 'message', template: { whatsapp_message: 'Bonjour {{first_name}}, je vous ai envoyé un email concernant le recrutement de profils commerciaux. Avez-vous 5 minutes pour en discuter ?' }, task_title: '💬 WhatsApp — {{contact_name}}', instructions: 'Message court et professionnel' },
        { order: 3, delay_days: 7, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Cas client : comment nous avons placé un Head of Sales en 3 semaines', body: 'Bonjour {{first_name}},\n\nJe voulais partager un cas récent : nous avons accompagné une entreprise SaaS dans le recrutement d\'un Head of Sales. Résultat : candidat placé en 3 semaines, toujours en poste 1 an plus tard.\n\nSi vous avez des projets de recrutement en cours, je serais ravi d\'en discuter.\n\nCordialement' }, task_title: '📧 Envoyer cas client à {{contact_name}}', instructions: 'Adapter le cas client au secteur de l\'entreprise' },
        { order: 4, delay_days: 10, delay_hours: 0, channel: 'call', action: 'call', template: {}, task_title: '📞 Proposition de meeting — {{contact_name}}', instructions: 'Proposer un meeting en personne ou visio pour approfondir' },
        { order: 5, delay_days: 14, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Dernière relance — {{first_name}}', body: 'Bonjour {{first_name}},\n\nJe ne souhaite pas vous importuner. Si le timing n\'est pas idéal, je reste disponible quand vos projets de recrutement se concrétiseront.\n\nBelle continuation,\n{{user_name}}' }, task_title: '📧 Breakup email — {{contact_name}}', instructions: 'Email final, professionnel et respectueux' },
      ],
    },
    // 3. Candidat warm — Post-entretien
    {
      nom: 'Candidat warm — Post-entretien',
      description: 'Séquence de suivi après un entretien candidat. 4 étapes sur 5 jours.',
      persona: 'Candidat en process',
      targetType: 'candidate',
      stopOnReply: true,
      steps: [
        { order: 0, delay_days: 0, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Merci pour l\'entretien — {{mandate_title}}', body: 'Bonjour {{first_name}},\n\nMerci pour notre échange. J\'ai pris bonne note de vos attentes et de votre intérêt pour le poste de {{mandate_title}} chez {{company_name}}.\n\nJe reviens vers vous très rapidement avec les prochaines étapes.\n\nCordialement' }, task_title: '📧 Email de remerciement à {{contact_name}}', instructions: 'Envoyer dans les 2h après l\'entretien' },
        { order: 1, delay_days: 1, delay_hours: 0, channel: 'call', action: 'call', template: {}, task_title: '📞 Demander feedback au client — {{mandate_title}}', instructions: 'Appeler le client pour obtenir un retour sur l\'entretien' },
        { order: 2, delay_days: 3, delay_hours: 0, channel: 'call', action: 'call', template: {}, task_title: '📞 Point d\'étape avec {{contact_name}}', instructions: 'Tenir le candidat informé de l\'avancement du process' },
        { order: 3, delay_days: 5, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Update — {{mandate_title}}', body: 'Bonjour {{first_name}},\n\nJe souhaitais vous faire un point d\'étape sur votre candidature pour le poste de {{mandate_title}} chez {{company_name}}.\n\nCordialement' }, task_title: '📧 Update process à {{contact_name}}', instructions: 'Inclure le feedback client et les prochaines étapes' },
      ],
    },
    // 4. Startup Founder / CEO
    {
      nom: 'Startup Founder / CEO',
      description: 'Séquence directe et concise pour les fondateurs et CEO de startups. 4 étapes sur 7 jours.',
      persona: 'Startup Founder',
      targetType: 'client',
      stopOnReply: true,
      steps: [
        { order: 0, delay_days: 0, delay_hours: 0, channel: 'whatsapp', action: 'message', template: { whatsapp_message: 'Bonjour {{first_name}}, je suis {{user_name}} de HumanUp. On accompagne les startups dans le recrutement de leurs premiers commerciaux. Un café ou un call rapide pour en discuter ?' }, task_title: '💬 WhatsApp intro — {{contact_name}}', instructions: 'Message court et direct. Les founders préfèrent WhatsApp.' },
        { order: 1, delay_days: 1, delay_hours: 0, channel: 'email', action: 'send', template: { subject: '{{company_name}} — votre premier commercial', body: 'Bonjour {{first_name}},\n\nRecruter son premier commercial est un moment clé pour une startup. Mauvais recrutement = 6 mois perdus.\n\nNous avons l\'habitude d\'accompagner des startups dans cette étape critique. Je serais ravi d\'échanger sur votre stratégie commerciale.\n\nCordialement' }, task_title: '📧 Email contexte marché — {{contact_name}}', instructions: 'Mentionner des exemples de startups du même secteur' },
        { order: 2, delay_days: 3, delay_hours: 0, channel: 'call', action: 'call', template: {}, task_title: '📞 Appel direct — {{contact_name}}', instructions: 'Pitch direct de 30 secondes. Les founders aiment aller vite.' },
        { order: 3, delay_days: 7, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Re: {{company_name}} — relance', body: 'Bonjour {{first_name}},\n\nJe me permets une dernière relance. Si le timing est bon, je suis dispo cette semaine.\n\nSinon, pas de souci — je reste dans votre réseau.\n\n{{user_name}}' }, task_title: '📧 Relance finale — {{contact_name}}', instructions: 'Dernière tentative, rester bref' },
      ],
    },
  ];

  // 5. Adchase — Relance multicanal (targeting clients)
  defaults.push({
    nom: 'Adchase — Relance multicanal',
    description: 'Séquence de relance pour les prospects Adchase qui n\'ont pas répondu à l\'envoi de profil anonymisé. 5 étapes sur 14 jours.',
    persona: 'Prospect Adchase',
    targetType: 'client',
    stopOnReply: true,
    steps: [
      { order: 0, delay_days: 3, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Re: Profil candidat — avez-vous eu le temps d\'y jeter un œil ?', body: 'Bonjour {{first_name}},\n\nJe me permets de revenir vers vous suite à l\'envoi du profil que je vous ai transmis.\n\nCe candidat est toujours disponible et correspond bien à vos enjeux de recrutement actuels.\n\nSeriez-vous disponible pour un échange rapide cette semaine ?\n\nCordialement,\n{{user_name}}' }, task_title: '📧 Relance email J+3 — {{contact_name}}', instructions: 'Relance douce, rappeler le profil envoyé.' },
      { order: 1, delay_days: 5, delay_hours: 0, channel: 'call', action: 'call', template: {}, task_title: '📞 Appel suivi J+5 — {{contact_name}}', instructions: 'Appeler pour vérifier la réception de l\'email et qualifier l\'intérêt. Pitch 30sec sur le profil.' },
      { order: 2, delay_days: 7, delay_hours: 0, channel: 'whatsapp', action: 'message', template: { whatsapp_message: 'Bonjour {{first_name}}, je vous ai envoyé un profil candidat par email il y a quelques jours. Avez-vous eu le temps d\'y jeter un œil ? Je reste dispo pour en discuter.' }, task_title: '💬 WhatsApp message court J+7 — {{contact_name}}', instructions: 'Message court et direct par WhatsApp.' },
      { order: 3, delay_days: 10, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Dernière relance — profil disponible', body: 'Bonjour {{first_name}},\n\nJe me permets une dernière relance concernant le profil que je vous ai envoyé.\n\nCe candidat est très demandé et je ne pourrai pas garantir sa disponibilité encore longtemps.\n\nSi vous souhaitez en discuter, je suis disponible cette semaine.\n\nCordialement,\n{{user_name}}' }, task_title: '📧 Dernier email J+10 — {{contact_name}}', instructions: 'Créer un sentiment d\'urgence raisonnable.' },
      { order: 4, delay_days: 14, delay_hours: 0, channel: 'email', action: 'send', template: { subject: '', body: '' }, task_title: '✅ Clôturer le suivi — {{contact_name}}', instructions: 'Clôturer le suivi Adchase. Mettre à jour le statut du prospect. Si pas de réponse, marquer comme "not_interested".' },
    ],
  });

  for (const seq of defaults) {
    await prisma.sequence.create({
      data: {
        nom: seq.nom,
        description: seq.description,
        persona: seq.persona,
        targetType: seq.targetType,
        stopOnReply: seq.stopOnReply,
        steps: seq.steps as any,
        createdById: userId,
      },
    });
  }

  return { seeded: true, count: defaults.length };
}
