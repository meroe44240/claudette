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
    isSystem: (s as any).isSystem ?? false,
    autoTrigger: (s as any).autoTrigger ?? false,
    triggerEvent: (s as any).triggerEvent ?? null,
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
  const runs = await prisma.sequenceRun.findMany({
    where: { status: { in: ['running', 'paused_reply'] } },
    include: {
      sequence: { select: { nom: true, targetType: true, persona: true, steps: true, isSystem: true } },
      stepLogs: { orderBy: { stepOrder: 'asc' } },
    },
    orderBy: { startedAt: 'desc' },
  });

  return runs.map(run => {
    const steps = run.sequence.steps as unknown as SequenceStep[];
    const meta = (run.metadata ?? {}) as Record<string, string>;
    const currentStepData = steps[run.currentStep];
    return {
      ...run,
      contactName: meta.contactName || '',
      companyName: meta.companyName || '',
      totalSteps: steps.length,
      currentStepChannel: currentStepData?.channel || null,
      currentStepTitle: currentStepData?.task_title || null,
      lastStepLog: run.stepLogs[run.stepLogs.length - 1] || null,
    };
  });
}

export async function getCompletedRuns() {
  const runs = await prisma.sequenceRun.findMany({
    where: { status: { in: ['completed', 'cancelled'] } },
    include: {
      sequence: { select: { nom: true, targetType: true, persona: true, steps: true, isSystem: true } },
      stepLogs: { orderBy: { stepOrder: 'asc' } },
    },
    orderBy: { startedAt: 'desc' },
    take: 50,
  });

  return runs.map(run => {
    const steps = run.sequence.steps as unknown as SequenceStep[];
    const meta = (run.metadata ?? {}) as Record<string, string>;
    const hasReply = run.stepLogs.some(l => l.status === 'reply_detected');
    return {
      ...run,
      contactName: meta.contactName || '',
      companyName: meta.companyName || '',
      totalSteps: steps.length,
      endReason: hasReply ? 'reply' : run.status === 'completed' ? 'cold' : 'cancelled',
    };
  });
}

// ─── RUN DETAILS (for MCP get_sequence_details) ─────

export async function getRunDetails(runId: string) {
  const run = await prisma.sequenceRun.findUnique({
    where: { id: runId },
    include: {
      sequence: true,
      stepLogs: { orderBy: { stepOrder: 'asc' } },
      dailyResearch: { orderBy: { researchDate: 'desc' }, take: 1 },
    },
  });

  if (!run) throw new NotFoundError('SequenceRun', runId);

  const steps = run.sequence.steps as unknown as SequenceStep[];
  const meta = (run.metadata ?? {}) as Record<string, string>;
  const startDate = new Date(run.startedAt);

  const stepsDetail = steps.map((step, i) => {
    const log = run.stepLogs.find(l => l.stepOrder === i);
    const scheduledDate = new Date(startDate);
    scheduledDate.setDate(scheduledDate.getDate() + step.delay_days);

    return {
      order: i + 1,
      total: steps.length,
      channel: step.channel,
      title: resolveVariables(step.task_title, run),
      instructions: step.instructions ? resolveVariables(step.instructions, run) : undefined,
      scheduled_date: scheduledDate.toISOString().substring(0, 10),
      delay_days: step.delay_days,
      status: i < run.currentStep ? (log?.status || 'done') :
              i === run.currentStep ? 'current' : 'upcoming',
      executed_at: log?.executedAt,
      result: log?.result,
      task_id: log?.taskId,
    };
  });

  return {
    run_id: run.id,
    sequence_name: run.sequence.nom,
    contact_name: meta.contactName || '',
    company_name: meta.companyName || '',
    status: run.status,
    current_step: run.currentStep + 1,
    total_steps: steps.length,
    started_at: run.startedAt,
    next_action_at: run.nextActionAt,
    push_id: run.pushId,
    steps: stepsDetail,
    latest_research: run.dailyResearch[0]?.researchData || null,
  };
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

  // ── AI Research on-demand (for system sequences like Persistance Client) ──
  const meta = (run.metadata ?? {}) as Record<string, string>;
  let aiContent: Record<string, string> | null = null;

  if (run.sequence.isSystem && meta.contactName && meta.companyName) {
    try {
      const { getOrRunResearch, generateStepContent } = await import('./sequence-research.service.js');
      const research = await getOrRunResearch(run.id, meta.contactName, meta.companyName);

      if (research) {
        const generated = await generateStepContent(
          run.id,
          currentStep.channel,
          currentStep.task_title,
          meta.contactName,
          meta.companyName,
          meta.candidatName || '',
          meta.userName || '',
          meta.bookingLink || '',
          research,
        );
        if (generated) {
          aiContent = generated as Record<string, string>;
        }
      }
    } catch (err) {
      console.error(`[Sequence] AI research failed for run ${runId}, continuing without:`, err);
    }
  }

  // Create a TASK for this step — the recruiter will validate/execute it
  const taskTitle = resolveVariables(currentStep.task_title, run);

  // Build enriched task content with AI research
  let taskContenu = currentStep.instructions ? resolveVariables(currentStep.instructions, run) : '';
  if (aiContent) {
    if (aiContent.call_brief) {
      taskContenu += `\n\n📋 BRIEF IA :\n${aiContent.call_brief}`;
    }
    if (aiContent.email_subject) {
      taskContenu += `\n\n📧 SUJET SUGGÉRÉ :\n${aiContent.email_subject}`;
    }
    if (aiContent.email_body) {
      taskContenu += `\n\n📧 EMAIL PRÉ-RÉDIGÉ :\n${aiContent.email_body}`;
    }
    if (aiContent.linkedin_message) {
      taskContenu += `\n\n💬 MESSAGE LINKEDIN :\n${aiContent.linkedin_message}`;
    }
  }

  const task = await prisma.activite.create({
    data: {
      type: 'TACHE',
      isTache: true,
      tacheCompleted: false,
      entiteType: run.targetType === 'candidate' ? 'CANDIDAT' : 'CLIENT',
      entiteId: run.targetId,
      userId: run.assignedToId,
      titre: taskTitle,
      contenu: taskContenu || undefined,
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
        aiGenerated: !!aiContent,
        aiContent: aiContent || undefined,
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

    // Auto-handle cold prospect when sequence completes
    try {
      await handleColdProspect(runId);
    } catch (err) {
      console.error(`[Sequence] Error handling cold prospect for run ${runId}:`, err);
    }
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

// ─── SEQUENCE STATS ────────────────────────────────

export async function getSequenceStats() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const allRuns = await prisma.sequenceRun.findMany({
    where: { startedAt: { gte: thirtyDaysAgo } },
    include: {
      stepLogs: { select: { channel: true, status: true, stepOrder: true } },
    },
  });

  const totalRuns = allRuns.length;
  const replied = allRuns.filter(r => r.stepLogs.some(l => l.status === 'reply_detected'));
  const repliedCount = replied.length;
  const tauxReponse = totalRuns > 0 ? Math.round((repliedCount / totalRuns) * 100) : 0;

  // Average step of reply
  const replySteps = replied.map(r => {
    const replyLog = r.stepLogs.find(l => l.status === 'reply_detected');
    return replyLog?.stepOrder ?? 0;
  });
  const avgReplyStep = replySteps.length > 0
    ? Math.round((replySteps.reduce((a, b) => a + b, 0) / replySteps.length) * 10) / 10
    : 0;

  // Best/worst channel
  const channelStats = new Map<string, { sent: number; replied: number }>();
  for (const run of allRuns) {
    for (const log of run.stepLogs) {
      const ch = log.channel || 'unknown';
      const stat = channelStats.get(ch) || { sent: 0, replied: 0 };
      stat.sent++;
      if (log.status === 'reply_detected' || log.status === 'validated') stat.replied++;
      channelStats.set(ch, stat);
    }
  }

  const channelResults = [...channelStats.entries()]
    .filter(([, s]) => s.sent >= 3)
    .map(([channel, s]) => ({
      channel,
      taux_reponse: Math.round((s.replied / s.sent) * 100),
      total: s.sent,
    }))
    .sort((a, b) => b.taux_reponse - a.taux_reponse);

  const coldCount = allRuns.filter(r => r.status === 'completed' && !r.stepLogs.some(l => l.status === 'reply_detected')).length;

  // Average days to reply
  const replyDays = replied.map(r => {
    const replyLog = r.stepLogs.find(l => l.status === 'reply_detected');
    if (!replyLog) return 0;
    return Math.floor((new Date().getTime() - new Date(r.startedAt).getTime()) / (1000 * 86400));
  });
  const avgReplyDays = replyDays.length > 0
    ? Math.round((replyDays.reduce((a, b) => a + b, 0) / replyDays.length) * 10) / 10
    : 0;

  return {
    period: '30j',
    total_runs: totalRuns,
    taux_reponse: tauxReponse,
    replied_count: repliedCount,
    etape_moyenne_reponse: avgReplyStep,
    meilleur_canal: channelResults[0] || null,
    pire_canal: channelResults[channelResults.length - 1] || null,
    channels: channelResults,
    cold_count: coldCount,
    temps_moyen_reponse_jours: avgReplyDays,
  };
}

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

  const defaults: Array<{
    nom: string;
    description: string;
    persona: string;
    targetType: string;
    stopOnReply: boolean;
    steps: any[];
    isSystem?: boolean;
    autoTrigger?: boolean;
    triggerEvent?: string;
  }> = [
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

  // 6. Persistance Client v4 — 10 étapes, 28 jours (SYSTÈME)
  const persistanceSteps: SequenceStep[] = [
    { order: 0, delay_days: 1, delay_hours: 0, channel: 'call', action: 'call', template: {}, task_title: '📞 Rappeler {{first_name}} ({{company_name}}) — 2/10', instructions: 'Brief IA : signal du jour + angle de relance + rappel du profil poussé hier. Lire le brief, appeler, loguer le résultat.' },
    { order: 1, delay_days: 3, delay_hours: 0, channel: 'whatsapp', action: 'message', template: { whatsapp_message: '{{first_name}}, j\'ai vu {{ai_signal}}. Avez-vous eu le temps de regarder le profil que je vous ai envoyé ? Dispo pour un call rapide ? {{booking_link}}' }, task_title: '💬 LinkedIn {{first_name}} ({{company_name}}) — 3/10', instructions: 'L\'IA a identifié les posts récents à liker/commenter. Message pré-rédigé basé sur un VRAI signal (offre, post, actu). Si aucun signal : message basé sur le contexte entreprise. Copier le message, aller sur LinkedIn, envoyer, cocher fait.' },
    { order: 2, delay_days: 5, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Un profil {{mandate_title}} pour {{company_name}}', body: 'Bonjour {{first_name}},\n\nSuite à notre échange, je souhaitais vous partager quelques éléments concrets sur le profil que je vous ai transmis :\n\n{{ai_profile_highlights}}\n\nCe profil correspond bien à {{ai_company_context}}.\n\nSeriez-vous disponible pour un échange de 30 minutes ?\n{{booking_link}}\n\nCordialement,\n{{user_name}}' }, task_title: '📧 Email profil à {{first_name}} ({{company_name}}) — 4/10', instructions: 'Email pré-rédigé avec : faits réels du CV (expériences, chiffres) + lien avec actu entreprise + booking link 30min. Lire, ajuster, VALIDER avant envoi.' },
    { order: 3, delay_days: 8, delay_hours: 0, channel: 'call', action: 'call', template: { whatsapp_message: '{{first_name}}, j\'ai essayé de vous joindre. Voici un lien pour bloquer un créneau si c\'est plus simple : {{booking_link}}' }, task_title: '📞 Appeler {{first_name}} ({{company_name}}) — 5/10', instructions: 'Brief pré-call mis à jour par l\'IA. Si call sans réponse : SMS pré-rédigé avec booking link à VALIDER avant envoi.' },
    { order: 4, delay_days: 10, delay_hours: 0, channel: 'email', action: 'send', template: { subject: '{{ai_insight_subject}}', body: 'Bonjour {{first_name}},\n\n{{ai_insight_content}}\n\nJ\'ai pensé que cela pourrait vous intéresser dans le cadre de vos projets chez {{company_name}}.\n\nBonne lecture,\n{{user_name}}' }, task_title: '📧 Email insight {{first_name}} ({{company_name}}) — 6/10', instructions: 'L\'IA a trouvé une info utile cette nuit : étude sectorielle, benchmark salaires, article pertinent. On PARTAGE, on ne demande RIEN. Le prospect reçoit de la valeur gratuite. VALIDER avant envoi.' },
    { order: 5, delay_days: 14, delay_hours: 0, channel: 'whatsapp', action: 'message', template: { whatsapp_message: '{{first_name}}, {{ai_linkedin_signal_message}}' }, task_title: '💬 LinkedIn signal {{first_name}} ({{company_name}}) — 7/10', instructions: 'L\'IA cherche un signal frais. SI trouvé : message qui réagit au signal. SI aucun signal : REPORTER AUTOMATIQUEMENT de 2 jours. Pas de message LinkedIn sans raison.' },
    { order: 6, delay_days: 16, delay_hours: 0, channel: 'call', action: 'call', template: {}, task_title: '📞 Appeler {{first_name}} ({{company_name}}) — 8/10', instructions: 'Brief IA frais : historique des tentatives, dernier signal, angle recommandé. Dernière tentative d\'appel avant la phase email finale.' },
    { order: 7, delay_days: 20, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Comment nous avons placé un {{ai_case_study_role}} en {{ai_case_study_duration}}', body: 'Bonjour {{first_name}},\n\n{{ai_case_study_content}}\n\nSi vous avez des projets de recrutement similaires, je serais ravi d\'en discuter.\n\n{{booking_link}}\n\nCordialement,\n{{user_name}}' }, task_title: '📧 Email case study {{first_name}} ({{company_name}}) — 9/10', instructions: 'Case study basé sur un placement RÉEL de l\'ATS, même secteur, chiffres réels anonymisés. Si aucun placement dans le secteur : stats générales HumanUp. VALIDER avant envoi.' },
    { order: 8, delay_days: 23, delay_hours: 0, channel: 'call', action: 'call', template: { whatsapp_message: '{{first_name}}, dernier message de ma part. Si le timing est bon : {{booking_link}} — sinon, pas de souci. {{user_name}}' }, task_title: '📱 Dernier contact {{first_name}} ({{company_name}}) — 10/10', instructions: 'SMS honnête : "dernier message", booking link. VALIDER avant envoi. Puis appeler.' },
    { order: 9, delay_days: 28, delay_hours: 0, channel: 'email', action: 'send', template: { subject: 'Je ne vous dérangerai plus — {{first_name}}', body: 'Bonjour {{first_name}},\n\nJe comprends que le timing n\'est pas idéal. Deux options :\n\n1. On planifie un échange dans quelques semaines/mois quand vos projets se concrétiseront : {{booking_link_mandate}}\n2. Je ne vous contacte plus\n\nDans les deux cas, je reste dans votre réseau.\n\nBelle continuation,\n{{user_name}}' }, task_title: '📧 Breakup {{first_name}} ({{company_name}}) — clôture', instructions: 'Email breakup : respectueux, porte ouverte, 2 options. VALIDER avant envoi. Après envoi → passage automatique en Cold.' },
  ];

  defaults.push({
    nom: 'Persistance Client',
    description: 'Séquence automatique après push CV. 10 tentatives sur 28 jours. Call + LinkedIn + Email + SMS. Recherche IA quotidienne. Chaque action validée par le recruteur.',
    persona: 'Prospect Push CV',
    targetType: 'client',
    stopOnReply: true,
    isSystem: true,
    autoTrigger: true,
    triggerEvent: 'push_cv',
    steps: persistanceSteps as any[],
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
        isSystem: seq.isSystem ?? false,
        autoTrigger: seq.autoTrigger ?? false,
        triggerEvent: seq.triggerEvent ?? null,
      },
    });
  }

  return { seeded: true, count: defaults.length };
}

// ─── COLD MANAGEMENT ──────────────────────────────────
// After 10 steps exhausted: create recontact task at 3 months (1 month if email was opened)

export async function handleColdProspect(runId: string) {
  const run = await prisma.sequenceRun.findUnique({
    where: { id: runId },
    include: {
      sequence: true,
      stepLogs: { orderBy: { stepOrder: 'asc' } },
    },
  });

  if (!run || run.status !== 'completed') return null;

  // Check if any email was opened (for shorter recontact delay)
  const hadEmailOpened = run.stepLogs.some(
    (log) => log.channel === 'email' && (log.result as any)?.opened === true,
  );

  // Recontact delay: 1 month if email opened, 3 months otherwise
  const recontactDays = hadEmailOpened ? 30 : 90;
  const recontactDate = new Date();
  recontactDate.setDate(recontactDate.getDate() + recontactDays);

  const meta = (run.metadata ?? {}) as Record<string, string>;
  const contactLabel = meta.contactName || 'Prospect';
  const companyLabel = meta.companyName || '';

  // Create recontact task
  await prisma.activite.create({
    data: {
      type: 'TACHE',
      isTache: true,
      tacheCompleted: false,
      entiteType: 'CLIENT',
      entiteId: run.targetId,
      userId: run.assignedToId || '',
      titre: `🔄 Recontacter ${contactLabel}${companyLabel ? ` (${companyLabel})` : ''} — COLD`,
      contenu: `Séquence "${run.sequence.nom}" terminée (${run.stepLogs.length} étapes). Aucune réponse. ${hadEmailOpened ? 'Email ouvert — prospect potentiellement intéressé.' : 'Aucun signe d\'intérêt.'} Recontact planifié à ${recontactDate.toLocaleDateString('fr-FR')}.`,
      source: 'SYSTEME',
      tacheDueDate: recontactDate,
      metadata: {
        priority: hadEmailOpened ? 'HAUTE' : 'MOYENNE',
        isColdRecontact: true,
        sequenceRunId: run.id,
        emailOpened: hadEmailOpened,
      },
    },
  });

  // Create notification
  if (run.assignedToId) {
    await prisma.notification.create({
      data: {
        userId: run.assignedToId,
        type: 'SYSTEME',
        titre: `${contactLabel} passe en COLD — recontact prévu le ${recontactDate.toLocaleDateString('fr-FR')}`,
        contenu: `La séquence "${run.sequence.nom}" est terminée sans réponse. ${hadEmailOpened ? 'L\'email a été ouvert — recontact dans 1 mois.' : 'Recontact planifié dans 3 mois.'}`,
        entiteType: 'CLIENT',
        entiteId: run.targetId,
      },
    });
  }

  return { cold: true, recontactDate, hadEmailOpened, recontactDays };
}

// ─── AUTO-TRIGGER PERSISTENCE SEQUENCE AFTER PUSH ─────

export async function triggerPersistenceSequence(data: {
  pushId: string;
  prospectId: string;
  prospectName: string;
  prospectCompany: string;
  prospectEmail?: string;
  candidatName: string;
  recruiterId: string;
}) {
  // Find the Persistance Client system sequence
  const persistenceSeq = await prisma.sequence.findFirst({
    where: {
      isSystem: true,
      autoTrigger: true,
      triggerEvent: 'push_cv',
      isActive: true,
    },
  });

  if (!persistenceSeq) {
    console.log('[Sequence] No active Persistance Client template found, skipping auto-trigger');
    return null;
  }

  // Check if a sequence is already running for this prospect
  const existingRun = await prisma.sequenceRun.findFirst({
    where: {
      targetType: 'client',
      targetId: data.prospectId,
      status: { in: ['running', 'paused_reply'] },
    },
  });

  if (existingRun) {
    console.log(`[Sequence] Sequence already active for prospect ${data.prospectId}, skipping`);
    return null;
  }

  // Start the persistence run
  const run = await startRun({
    sequenceId: persistenceSeq.id,
    targetType: 'client',
    targetId: data.prospectId,
    assignedToId: data.recruiterId,
    metadata: {
      contactName: data.prospectName,
      companyName: data.prospectCompany,
      contactEmail: data.prospectEmail || '',
      candidatName: data.candidatName,
      pushId: data.pushId,
      userName: '',  // Will be resolved from user context
    },
  });

  // Update the run with pushId
  await prisma.sequenceRun.update({
    where: { id: run.id },
    data: { pushId: data.pushId },
  });

  console.log(`[Sequence] Persistance Client sequence started for ${data.prospectName} (${data.prospectCompany}) — run ${run.id}`);
  return run;
}
