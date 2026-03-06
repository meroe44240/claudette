import prisma from '../../lib/db.js';

// ─── TYPES ──────────────────────────────────────────

export interface AiConfigData {
  aiProvider: 'openai' | 'anthropic' | 'gemini';
  model: string;
}

export interface AiConfigResponse {
  provider: string;
  aiProvider: 'openai' | 'anthropic' | 'gemini';
  model: string;
  enabled: boolean;
  hasApiKey: boolean;
}

export interface SaveAiConfigInput {
  provider: 'openai' | 'anthropic' | 'gemini';
  apiKey: string;
  model: string;
}

// ─── GET AI CONFIG ──────────────────────────────────

export async function getAiConfig(userId: string): Promise<AiConfigResponse | null> {
  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'ai' } },
  });

  if (!config) return null;

  const data = config.config as unknown as AiConfigData;
  const rawModel = data.model || 'gpt-4o';
  const model = data.aiProvider === 'gemini' ? migrateModelId(rawModel) : rawModel;

  return {
    provider: 'ai',
    aiProvider: data.aiProvider || 'openai',
    model,
    enabled: config.enabled,
    hasApiKey: !!config.accessToken,
  };
}

// ─── MIGRATE STALE MODEL IDS ─────────────────────────

const MODEL_MIGRATIONS: Record<string, string> = {
  'gemini-2.5-pro-preview-05-06': 'gemini-2.5-pro',
  'gemini-2.5-flash-preview-04-17': 'gemini-2.5-flash',
  'gemini-2.0-flash': 'gemini-2.5-flash', // deprecated for new users
};

function migrateModelId(model: string): string {
  return MODEL_MIGRATIONS[model] || model;
}

// ─── GET AI CONFIG WITH KEY (internal use) ──────────

export async function getAiConfigWithKey(userId: string): Promise<{
  aiProvider: 'openai' | 'anthropic' | 'gemini';
  model: string;
  apiKey: string;
} | null> {
  const config = await prisma.integrationConfig.findUnique({
    where: { userId_provider: { userId, provider: 'ai' } },
  });

  if (!config || !config.accessToken || !config.enabled) return null;

  const data = config.config as unknown as AiConfigData;
  const rawModel = data.model || 'gpt-4o';
  const model = data.aiProvider === 'gemini' ? migrateModelId(rawModel) : rawModel;

  // Auto-fix stale model in DB if migrated
  if (model !== rawModel) {
    console.log(`[AI Config] Auto-migrating model: ${rawModel} → ${model}`);
    await prisma.integrationConfig.update({
      where: { userId_provider: { userId, provider: 'ai' } },
      data: { config: { ...data, model } as any },
    });
  }

  return {
    aiProvider: data.aiProvider || 'openai',
    model,
    apiKey: config.accessToken,
  };
}

// ─── SAVE AI CONFIG ─────────────────────────────────

export async function saveAiConfig(userId: string, input: SaveAiConfigInput) {
  const configData: AiConfigData = {
    aiProvider: input.provider,
    model: input.model,
  };

  // If apiKey is '__KEEP_EXISTING__', don't update the key
  const shouldUpdateKey = input.apiKey !== '__KEEP_EXISTING__';

  const result = await prisma.integrationConfig.upsert({
    where: { userId_provider: { userId, provider: 'ai' } },
    create: {
      userId,
      provider: 'ai',
      accessToken: shouldUpdateKey ? input.apiKey : '',
      config: configData as any,
      enabled: true,
    },
    update: {
      ...(shouldUpdateKey ? { accessToken: input.apiKey } : {}),
      config: configData as any,
      enabled: true,
    },
  });

  return {
    provider: 'ai',
    aiProvider: configData.aiProvider,
    model: configData.model,
    enabled: result.enabled,
    hasApiKey: !!result.accessToken,
  };
}

// ─── TEST AI CONNECTION ─────────────────────────────

export async function testAiConnection(userId: string): Promise<{ success: boolean; message: string }> {
  const config = await getAiConfigWithKey(userId);

  if (!config) {
    return { success: false, message: 'Configuration IA non trouvée. Veuillez configurer votre clé API.' };
  }

  try {
    if (config.aiProvider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Reply with "ok"' }],
          max_tokens: 5,
        }),
      });

      if (!response.ok) {
        const error = await response.json() as any;
        return {
          success: false,
          message: `Erreur OpenAI: ${error.error?.message || response.statusText}`,
        };
      }

      return { success: true, message: 'Connexion OpenAI réussie !' };
    }

    if (config.aiProvider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'Reply with "ok"' }],
        }),
      });

      if (!response.ok) {
        const error = await response.json() as any;
        return {
          success: false,
          message: `Erreur Anthropic: ${error.error?.message || response.statusText}`,
        };
      }

      return { success: true, message: 'Connexion Anthropic réussie !' };
    }

    if (config.aiProvider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with "ok"' }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
      });

      if (!response.ok) {
        const error = await response.json() as any;
        return {
          success: false,
          message: `Erreur Gemini: ${error.error?.message || response.statusText}`,
        };
      }

      return { success: true, message: 'Connexion Gemini réussie !' };
    }

    return { success: false, message: 'Fournisseur IA non reconnu.' };
  } catch (err: any) {
    return { success: false, message: `Erreur de connexion: ${err.message}` };
  }
}
