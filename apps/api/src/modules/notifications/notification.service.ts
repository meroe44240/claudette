import type { TypeNotification, EntiteType } from '@prisma/client';

/**
 * In-app notifications feature was removed. Everything user-facing now goes
 * through Slack DM (via `slackUserId`). This module keeps `create()` as a
 * no-op stub so the ~14 callers spread across ai/call-summary, ai/call-brief,
 * transcripts, gmail, allo, calendar don't need to be touched right now —
 * they'll be cleaned in a follow-up refactor when we decide which pings
 * should route through Slack.
 *
 * The whole file will disappear once every caller stops importing it.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function create(_data: {
  userId: string;
  type: TypeNotification;
  titre: string;
  contenu?: string;
  entiteType?: EntiteType;
  entiteId?: string;
}) {
  // No-op: in-app notifications are removed. See file header.
  return null;
}
