import { Queue, Worker, type Job, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';

let connection: IORedis | null = null;
let feedbackQueue: Queue | null = null;

function getConnection(): ConnectionOptions {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return connection as unknown as ConnectionOptions;
}

export function getFeedbackQueue() {
  if (!feedbackQueue) {
    feedbackQueue = new Queue('feedback-reminders', { connection: getConnection() });
  }
  return feedbackQueue;
}

interface FeedbackJobData {
  activiteId: string;
  userId: string;
  entiteType: string;
  entiteId: string;
  meetingTitle: string;
}

export async function scheduleFeedbackReminder(data: FeedbackJobData) {
  const queue = getFeedbackQueue();
  return queue.add('create-feedback-task', data, {
    delay: 3 * 24 * 60 * 60 * 1000, // 3 days
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
  });
}

export function startFeedbackWorker() {
  // Dynamic import to avoid circular deps
  const worker = new Worker('feedback-reminders', async (job: Job<FeedbackJobData>) => {
    const { default: prisma } = await import('../lib/db.js');
    const { userId, entiteType, entiteId, meetingTitle } = job.data;

    await prisma.activite.create({
      data: {
        type: 'TACHE',
        isTache: true,
        tacheCompleted: false,
        tacheDueDate: new Date(),
        entiteType: entiteType as any,
        entiteId,
        userId,
        titre: `Feedback à recueillir — ${meetingTitle}`,
        contenu: `3 jours se sont écoulés depuis "${meetingTitle}". Pensez à recueillir le feedback.`,
        source: 'SYSTEME',
      },
    });

    await prisma.notification.create({
      data: {
        userId,
        type: 'TACHE_ECHEANCE',
        titre: `Feedback meeting à recueillir`,
        contenu: `Recueillez le feedback pour "${meetingTitle}"`,
        entiteType: entiteType as any,
        entiteId,
      },
    });
  }, { connection: getConnection() });

  console.log('Feedback reminder worker started');
  return worker;
}
