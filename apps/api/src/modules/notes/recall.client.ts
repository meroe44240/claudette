// Client Recall.ai : envoi des bots Meet / Teams et transcript temps réel.
//
// Sans RECALL_API_KEY, Humanup Notes tourne en mode simulation : aucun bot n'est
// envoyé, les calls se testent depuis l'app avec un transcript de démonstration.

export const BOT_NAME = process.env.NOTES_BOT_NAME || 'Humanup Notes';

const CHAT_MESSAGE_FR =
  'Bonjour, ce call est transcrit pour la prise de notes Humanup. Si vous préférez, demandez au membre Humanup de retirer le bot.';
const CHAT_MESSAGE_EN =
  'Hello, this call is transcribed for Humanup note taking. If you prefer, ask the Humanup team member to remove the bot.';

export function isRecallConfigured(): boolean {
  return Boolean(process.env.RECALL_API_KEY);
}

function baseUrl(): string {
  const region = process.env.RECALL_REGION || 'eu-central-1';
  return `https://${region}.recall.ai/api/v1`;
}

function publicApiUrl(): string {
  return (process.env.NOTES_PUBLIC_URL || process.env.APP_URL || 'https://ats.propium.co').replace(/\/$/, '');
}

async function recallFetch(path: string, init: RequestInit = {}): Promise<any> {
  const key = process.env.RECALL_API_KEY;
  if (!key) throw new Error('RECALL_API_KEY absente');
  // 507 = capacité temporairement indisponible : Recall demande de réessayer.
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${baseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (res.status === 507 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`Recall ${init.method || 'GET'} ${path} → ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
  throw new Error('Recall indisponible (507)');
}

export interface CreateBotInput {
  noteCallId: string;
  webhookSecret: string;
  meetingUrl: string;
  joinAt: Date;
  language?: 'fr' | 'en' | null;
}

export async function createBot(input: CreateBotInput): Promise<{ id: string }> {
  const webhookUrl = `${publicApiUrl()}/api/v1/notes/recall/realtime/${input.noteCallId}?secret=${encodeURIComponent(input.webhookSecret)}`;
  // Recall exige un join_at dans le futur ; un call déjà commencé part tout de suite.
  const joinAt = input.joinAt.getTime() > Date.now() + 60_000 ? input.joinAt.toISOString() : undefined;
  const body: Record<string, unknown> = {
    meeting_url: input.meetingUrl,
    bot_name: BOT_NAME,
    ...(joinAt ? { join_at: joinAt } : {}),
    metadata: { note_call_id: input.noteCallId },
    recording_config: {
      // Audio seulement : pas de vidéo enregistrée.
      video_mixed_layout: 'audio_only',
      video_mixed_mp4: null,
      transcript: {
        provider: {
          // « auto » gère le français, l'anglais et le passage de l'un à l'autre
          // (nécessite le mode prioritize_accuracy).
          recallai_streaming: {
            mode: process.env.RECALL_TRANSCRIPT_MODE || 'prioritize_accuracy',
            language_code: process.env.RECALL_LANGUAGE_CODE || 'auto',
          },
        },
        diarization: { use_separate_streams_when_available: true },
      },
      realtime_endpoints: [
        { type: 'webhook', url: webhookUrl, events: ['transcript.data'] },
      ],
    },
    chat: {
      on_bot_join: {
        send_to: 'everyone',
        message: input.language === 'en' ? CHAT_MESSAGE_EN : `${CHAT_MESSAGE_FR}\n\n${CHAT_MESSAGE_EN}`,
      },
    },
    automatic_leave: {
      waiting_room_timeout: 600,
      noone_joined_timeout: 600,
    },
  };
  const bot = await recallFetch('/bot/', { method: 'POST', body: JSON.stringify(body) });
  return { id: bot.id as string };
}

/** Supprime un bot programmé qui n'a pas encore rejoint. */
export async function deleteScheduledBot(botId: string): Promise<void> {
  await recallFetch(`/bot/${botId}/`, { method: 'DELETE' });
}

/** Fait quitter le call au bot. */
export async function leaveCall(botId: string): Promise<void> {
  await recallFetch(`/bot/${botId}/leave_call/`, { method: 'POST' });
}

/** Supprime les enregistrements et le transcript côté Recall. */
export async function deleteBotMedia(botId: string): Promise<void> {
  await recallFetch(`/bot/${botId}/delete_media/`, { method: 'POST' });
}

export async function getBot(botId: string): Promise<any> {
  return recallFetch(`/bot/${botId}/`);
}

/** Dernier statut connu du bot (joining_call, in_call_recording, call_ended, done, fatal…). */
export function lastStatusCode(bot: any): string | null {
  const changes: any[] = bot?.status_changes || [];
  return changes.length ? String(changes[changes.length - 1].code) : null;
}

/** Transcript final (si disponible) au format [{ speaker, text, t }]. */
export async function fetchFinalTranscript(bot: any): Promise<{ speaker: string; text: string; t: number }[] | null> {
  const url = bot?.recordings?.[0]?.media_shortcuts?.transcript?.data?.download_url;
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const parts = (await res.json()) as any[];
  if (!Array.isArray(parts)) return null;
  return parts
    .map((p) => ({
      speaker: p?.participant?.name || 'Participant',
      text: (p?.words || []).map((w: any) => w.text).join(' ').trim(),
      t: Number(p?.words?.[0]?.start_timestamp?.relative ?? 0),
    }))
    .filter((s) => s.text);
}
