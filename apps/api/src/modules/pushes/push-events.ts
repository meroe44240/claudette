/**
 * PushEvent logger — tracks the full lifecycle of a push.
 *
 * Every significant event (sent, opened, reply, followup, status change,
 * duplicate blocked) is logged here for analytics and timeline display.
 */

import prisma from '../../lib/db.js';
import { Prisma } from '@prisma/client';

export type PushEventType =
  | 'sent'
  | 'opened'
  | 'reply_received'
  | 'followup_sent'
  | 'status_changed'
  | 'duplicate_blocked';

export async function emitPushEvent(params: {
  pushId: string;
  eventType: PushEventType;
  actorType?: 'recruiter' | 'prospect' | 'system';
  actorId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.pushEvent.create({
      data: {
        pushId: params.pushId,
        eventType: params.eventType,
        actorType: params.actorType || 'system',
        actorId: params.actorId,
        metadata: (params.metadata || {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error(`[PushEvent] Failed to emit ${params.eventType} for push ${params.pushId}:`, err);
  }
}

/**
 * Get the full timeline of events for a push.
 */
export async function getPushTimeline(pushId: string) {
  return prisma.pushEvent.findMany({
    where: { pushId },
    orderBy: { occurredAt: 'desc' },
    take: 50,
  });
}
