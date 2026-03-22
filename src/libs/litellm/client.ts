import { logger } from '@/app/lib/utils/logger';
import type { AvailableModel, ModelOrigin } from '@/app/components/config';

type LiteLLMModel = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

type LiteLLMModelsResponse = {
  object: string;
  data: LiteLLMModel[];
};

const LITELLM_PROXY_URL =
  process.env.LITELLM_PROXY_URL || 'http://localhost:4000';
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY;

/** Infer the visual origin (for UI grouping) from a LiteLLM model name */
function inferOrigin(modelId: string): ModelOrigin {
  const lower = modelId.toLowerCase();
  if (
    lower.startsWith('gpt') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4')
  ) {
    return 'openai';
  }
  if (lower.startsWith('gemini')) {
    return 'google';
  }
  if (lower.startsWith('claude')) {
    return 'anthropic';
  }
  // Default to openai for unknown models
  return 'openai';
}

/** Infer a human-readable label from a LiteLLM model name */
function inferLabel(modelId: string): string {
  return modelId.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Check if a model likely supports extended thinking / reasoning */
function inferReasoning(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return (
    lower.includes('o1') ||
    lower.includes('o3') ||
    lower.includes('o4') ||
    lower.includes('opus') ||
    lower.includes('sonnet') ||
    (lower.includes('gemini') && lower.includes('pro'))
  );
}

// Cache for fetched models
let modelsCache: { data: AvailableModel[]; timestamp: number } | null = null;
const MODELS_CACHE_TTL = 60_000; // 1 minute

/**
 * Fetch available models from the LiteLLM proxy.
 * Returns models mapped to AvailableModel format for the UI.
 */
export async function fetchLiteLLMModels(): Promise<AvailableModel[]> {
  if (modelsCache && Date.now() - modelsCache.timestamp < MODELS_CACHE_TTL) {
    return modelsCache.data;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (LITELLM_MASTER_KEY) {
      headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
    }

    const response = await fetch(`${LITELLM_PROXY_URL}/v1/models`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn(
        { status: response.status },
        'Failed to fetch models from LiteLLM proxy',
      );
      return modelsCache?.data ?? [];
    }

    const data = (await response.json()) as LiteLLMModelsResponse;

    const models: AvailableModel[] = data.data.map((m) => ({
      value: m.id,
      label: inferLabel(m.id),
      provider: 'litellm' as const,
      origin: inferOrigin(m.id),
      reasoning: inferReasoning(m.id),
    }));

    modelsCache = { data: models, timestamp: Date.now() };
    return models;
  } catch (error) {
    logger.error({ err: error }, 'Error fetching models from LiteLLM proxy');
    return modelsCache?.data ?? [];
  }
}

/** Check if the LiteLLM proxy is reachable */
export async function isLiteLLMAvailable(): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (LITELLM_MASTER_KEY) {
      headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
    }

    const response = await fetch(`${LITELLM_PROXY_URL}/health`, {
      headers,
      signal: AbortSignal.timeout(3000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export function getLiteLLMProxyUrl(): string {
  return LITELLM_PROXY_URL;
}

export function getLiteLLMApiKey(): string | undefined {
  return LITELLM_MASTER_KEY;
}
