/**
 * Service centralisé pour appeler l'API Anthropic Claude.
 * Utilisé par les 4 features IA : cv_parsing, call_summary, call_brief, prospect_detection.
 *
 * - Deux modèles : Haiku (extraction rapide) et Sonnet (raisonnement + web search)
 * - Logging de chaque appel (tokens, coût, durée) dans AiUsageLog
 * - Gestion d'erreurs : retry JSON invalide, backoff 429, timeout
 */

import prisma from '../lib/db.js';

// ─── MODELS & COSTS ─────────────────────────────────────

const MODELS = {
  fast: 'claude-haiku-4-5-20251001',
  smart: 'claude-sonnet-4-5-20250929',
} as const;

type ModelTier = keyof typeof MODELS;

const FEATURE_MODEL_MAP: Record<string, ModelTier> = {
  cv_parsing: 'fast',
  call_summary: 'fast',
  call_brief: 'smart',
  prospect_detection: 'smart',
  task_extraction: 'smart', // existing feature
  job_description: 'fast',
};

// Cost per million tokens (USD)
const COSTS_PER_M: Record<string, { input: number; output: number }> = {
  [MODELS.fast]: { input: 1.0, output: 5.0 },
  [MODELS.smart]: { input: 3.0, output: 15.0 },
};

// ─── TYPES ───────────────────────────────────────────────

export interface ClaudeCallOptions {
  feature: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  userId: string;
}

export interface ClaudeWebSearchOptions extends ClaudeCallOptions {
  // Uses web_search_20250305 tool automatically
}

export interface ClaudeVisionOptions extends ClaudeCallOptions {
  imageBase64: string;
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf';
}

export interface ClaudeResponse {
  content: any; // Parsed JSON or raw text
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  durationMs: number;
}

// ─── API KEY ─────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY non configurée. Features IA désactivées.');
  }
  return key;
}

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ─── COST CALCULATION ────────────────────────────────────

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COSTS_PER_M[model] || COSTS_PER_M[MODELS.fast];
  return (inputTokens * rates.input) / 1_000_000 + (outputTokens * rates.output) / 1_000_000;
}

// ─── USAGE LOGGING ───────────────────────────────────────

async function logUsage(params: {
  feature: string;
  model: string;
  userId: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.aiUsageLog.create({
      data: {
        feature: params.feature,
        model: params.model,
        userId: params.userId,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        costUsd: calculateCost(params.model, params.inputTokens, params.outputTokens),
        durationMs: params.durationMs,
        success: params.success,
        error: params.error ?? null,
        metadata: (params.metadata ?? {}) as any,
      },
    });
  } catch (err) {
    // Don't let logging failures break the AI feature
    console.error('[claudeAI] Failed to log usage:', err);
  }
}

// ─── CORE API CALL ───────────────────────────────────────

async function singleCallClaude(
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Response> {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function rawCallClaude(params: {
  model: string;
  systemPrompt: string;
  messages: any[];
  maxTokens: number;
  temperature: number;
  tools?: any[];
  timeoutMs?: number;
}): Promise<{
  content: any[];
  usage: { input_tokens: number; output_tokens: number };
}> {
  const apiKey = getApiKey();

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens,
    temperature: params.temperature,
    system: params.systemPrompt,
    messages: params.messages,
  };

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools;
  }

  const effectiveTimeout = params.timeoutMs ?? 90_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), effectiveTimeout);

  try {
    // Retry logic: up to 3 attempts for rate-limit (429) and overloaded (529) errors
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const response = await singleCallClaude(apiKey, body, controller.signal);

      if (response.ok) {
        return (await response.json()) as any;
      }

      // Rate limited (429) or Overloaded (529) — retry with exponential backoff
      if (response.status === 429 || response.status === 529) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10);
        const backoffMs = Math.max(retryAfter * 1000, (attempt + 1) * 3000); // min 3s, 6s, 9s
        console.warn(`[claudeAI] ${response.status} on attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${backoffMs}ms...`);

        // On last retry for overloaded error, try falling back to the other model
        if (response.status === 529 && attempt === MAX_RETRIES - 2 && body.model === MODELS.fast) {
          console.warn(`[claudeAI] Falling back from Haiku to Sonnet due to overloaded Haiku`);
          body.model = MODELS.smart;
        }

        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      // Any other error — throw immediately
      const errBody = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errBody}`);
    }

    // All retries exhausted
    throw new Error(`Claude API: toutes les tentatives echouees (429/529) apres ${MAX_RETRIES} essais`);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── EXTRACT TEXT FROM RESPONSE ──────────────────────────

function extractText(content: any[]): string {
  return content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('\n');
}

/** For web search responses: extract only the LAST text block (the final JSON answer, not narration) */
function extractLastTextBlock(content: any[]): string {
  const textBlocks = content.filter((block: any) => block.type === 'text');
  if (textBlocks.length === 0) return '';
  return textBlocks[textBlocks.length - 1].text;
}

function parseJsonSafe(text: string): any {
  // Remove markdown code fences if present
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    // Try to find a JSON object embedded in the text (common with web search narration)
    const jsonMatch = clean.match(/(\{[\s\S]*\})\s*$/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    throw new Error('No valid JSON found in text');
  }
}

// ─── PUBLIC: callClaude ──────────────────────────────────

export async function callClaude(options: ClaudeCallOptions): Promise<ClaudeResponse> {
  const tier = FEATURE_MODEL_MAP[options.feature] || 'fast';
  const model = MODELS[tier];
  const maxTokens = options.maxTokens ?? 2000;
  const temperature = options.temperature ?? 0;
  const startTime = Date.now();

  let lastError: Error | null = null;

  // Try up to 2 times (retry once on JSON parse failure)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const userPrompt = attempt === 0
        ? options.userPrompt
        : options.userPrompt + '\n\nIMPORTANT : Reponds UNIQUEMENT en JSON valide, sans markdown, sans backticks, sans commentaires.';

      const result = await rawCallClaude({
        model,
        systemPrompt: options.systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens,
        temperature,
      });

      const durationMs = Date.now() - startTime;
      const rawText = extractText(result.content);
      let content: any;

      try {
        content = parseJsonSafe(rawText);
      } catch {
        if (attempt === 0) {
          lastError = new Error('Invalid JSON response from Claude');
          continue; // Retry with reinforced prompt
        }
        // On second attempt, return raw text
        content = rawText;
      }

      await logUsage({
        feature: options.feature,
        model,
        userId: options.userId,
        inputTokens: result.usage?.input_tokens ?? 0,
        outputTokens: result.usage?.output_tokens ?? 0,
        durationMs,
        success: true,
      });

      return {
        content,
        rawText,
        inputTokens: result.usage?.input_tokens ?? 0,
        outputTokens: result.usage?.output_tokens ?? 0,
        model,
        durationMs,
      };
    } catch (err: any) {
      lastError = err;
    }
  }

  const durationMs = Date.now() - startTime;
  await logUsage({
    feature: options.feature,
    model,
    userId: options.userId,
    inputTokens: 0,
    outputTokens: 0,
    durationMs,
    success: false,
    error: lastError?.message ?? 'Unknown error',
  });

  throw lastError;
}

// ─── PUBLIC: callClaudeWithWebSearch ─────────────────────

export async function callClaudeWithWebSearch(options: ClaudeWebSearchOptions): Promise<ClaudeResponse> {
  const tier = FEATURE_MODEL_MAP[options.feature] || 'smart';
  const model = MODELS[tier];
  const maxTokens = options.maxTokens ?? 4000;
  const temperature = options.temperature ?? 0;
  const startTime = Date.now();

  try {
    const result = await rawCallClaude({
      model,
      systemPrompt: options.systemPrompt,
      messages: [{ role: 'user', content: options.userPrompt }],
      maxTokens,
      temperature,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
      timeoutMs: 180_000, // 3 min for web search
    });

    const durationMs = Date.now() - startTime;
    // For web search: try last text block first (contains the JSON answer, not narration)
    const lastBlockText = extractLastTextBlock(result.content);
    const rawText = extractText(result.content);
    let content: any;

    try {
      content = parseJsonSafe(lastBlockText);
    } catch {
      // Fallback: try full text
      try {
        content = parseJsonSafe(rawText);
      } catch {
        content = rawText;
      }
    }

    await logUsage({
      feature: options.feature,
      model,
      userId: options.userId,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
      durationMs,
      success: true,
    });

    return {
      content,
      rawText,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
      model,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await logUsage({
      feature: options.feature,
      model,
      userId: options.userId,
      inputTokens: 0,
      outputTokens: 0,
      durationMs,
      success: false,
      error: err.message,
    });
    throw err;
  }
}

// ─── PUBLIC: callClaudeWithVision ────────────────────────

export async function callClaudeWithVision(options: ClaudeVisionOptions): Promise<ClaudeResponse> {
  const tier = FEATURE_MODEL_MAP[options.feature] || 'fast';
  const model = MODELS[tier];
  const maxTokens = options.maxTokens ?? 3000;
  const temperature = options.temperature ?? 0;
  const startTime = Date.now();

  try {
    // Determine content block type: 'document' for PDFs, 'image' for images
    const isDocument = options.mediaType === 'application/pdf';
    const contentBlock = isDocument
      ? {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: options.mediaType,
            data: options.imageBase64,
          },
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: options.mediaType,
            data: options.imageBase64,
          },
        };

    const result = await rawCallClaude({
      model,
      systemPrompt: options.systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: options.userPrompt,
            },
          ],
        },
      ],
      maxTokens,
      temperature,
    });

    const durationMs = Date.now() - startTime;
    const rawText = extractText(result.content);
    let content: any;

    try {
      content = parseJsonSafe(rawText);
    } catch {
      content = rawText;
    }

    await logUsage({
      feature: options.feature,
      model,
      userId: options.userId,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
      durationMs,
      success: true,
    });

    return {
      content,
      rawText,
      inputTokens: result.usage?.input_tokens ?? 0,
      outputTokens: result.usage?.output_tokens ?? 0,
      model,
      durationMs,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await logUsage({
      feature: options.feature,
      model,
      userId: options.userId,
      inputTokens: 0,
      outputTokens: 0,
      durationMs,
      success: false,
      error: err.message,
    });
    throw err;
  }
}

// ─── PUBLIC: getAiUsageStats (admin) ─────────────────────

export async function getAiUsageStats(period: 'week' | 'month' | 'all' = 'month') {
  const now = new Date();
  let since: Date;

  switch (period) {
    case 'week':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      since = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
      since = new Date(0);
      break;
  }

  const logs = await prisma.aiUsageLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
  });

  // Aggregate by feature
  const byFeature: Record<string, { calls: number; tokens: number; cost: number; errors: number }> = {};
  let totalCalls = 0;
  let totalCost = 0;
  let totalTokens = 0;
  let totalErrors = 0;

  for (const log of logs) {
    if (!byFeature[log.feature]) {
      byFeature[log.feature] = { calls: 0, tokens: 0, cost: 0, errors: 0 };
    }
    byFeature[log.feature].calls++;
    byFeature[log.feature].tokens += log.inputTokens + log.outputTokens;
    byFeature[log.feature].cost += log.costUsd;
    if (!log.success) byFeature[log.feature].errors++;

    totalCalls++;
    totalCost += log.costUsd;
    totalTokens += log.inputTokens + log.outputTokens;
    if (!log.success) totalErrors++;
  }

  // Aggregate by day (for chart)
  const byDay: Record<string, { calls: number; cost: number }> = {};
  for (const log of logs) {
    const day = log.createdAt.toISOString().split('T')[0];
    if (!byDay[day]) byDay[day] = { calls: 0, cost: 0 };
    byDay[day].calls++;
    byDay[day].cost += log.costUsd;
  }

  return {
    period,
    totalCalls,
    totalTokens,
    totalCost: Math.round(totalCost * 100) / 100,
    totalErrors,
    byFeature,
    byDay: Object.entries(byDay)
      .map(([date, data]) => ({ date, ...data, cost: Math.round(data.cost * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
