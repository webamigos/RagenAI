import { z } from 'zod';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import OpenAI from 'openai';
import { ChatCompletionFactory } from '@/libs/llm';
import { EmbeddingsFactory } from '@/libs/llm/embeddings-factory';
import type { ChatCompletionOptions } from '@/libs/llm/types/chat-completion';
import type { LiteLLMCredentials } from '@/libs/llm/types/credentials';
import { isReasoningModel, normalizeModelId } from '../../components/config';
import { logger } from '../utils/logger';
import { getLiteLLMOrgApiKey } from '@/features/organizations/services/organization-settings';

export const modelsSchema = z.object({
  provider: z.literal('litellm'),
  model: z.string().min(1),
});

// Models that don't support temperature parameter (reasoning/thinking models)
const modelsWithoutTemperature = ['o1', 'o3', 'o3-mini', 'o4-mini'];

const supportsTemperature = (model: string): boolean => {
  if (!model) {
    return true;
  }
  return !modelsWithoutTemperature.some((m) => model.includes(m));
};

function getLiteLLMCredentials(): LiteLLMCredentials {
  const baseUrl = process.env.LITELLM_PROXY_URL;
  if (!baseUrl) {
    throw new Error('LITELLM_PROXY_URL is required');
  }
  return {
    provider: 'litellm',
    baseUrl,
    apiKey: process.env.LITELLM_MASTER_KEY,
  };
}

function getDefaultModel(): string {
  const config = modelsSchema.parse({
    provider: process.env.DEFAULT_MODEL_PROVIDER,
    model: process.env.DEFAULT_MODEL,
  });
  return config.model;
}

// Lazy-initialized credentials and model (deferred to first use, not import time)
let _litellmCredentials: LiteLLMCredentials | null = null;
let _defaultModel: string | null = null;

function litellmCredentials(): LiteLLMCredentials {
  if (!_litellmCredentials) {
    _litellmCredentials = getLiteLLMCredentials();
  }
  return _litellmCredentials;
}

function defaultModel(): string {
  if (!_defaultModel) {
    _defaultModel = getDefaultModel();
  }
  return _defaultModel;
}

export const createChatCompletionInstance = (
  options: ChatCompletionOptions & { litellmApiKey?: string },
  streaming: boolean = true,
): LanguageModelV3 => {
  const rawModel =
    options.model || options.modelName || defaultModel() || undefined;
  const selectedModel = rawModel ? normalizeModelId(rawModel) : undefined;

  let temperature = options.temperature;
  if (selectedModel && !supportsTemperature(selectedModel)) {
    if (temperature !== undefined) {
      logger.info(
        { model: selectedModel, temperature },
        'Temperature parameter excluded for model that does not support it',
      );
    }
    temperature = undefined;
  }

  const reasoning = selectedModel ? isReasoningModel(selectedModel) : false;

  const credentials: LiteLLMCredentials = options.litellmApiKey
    ? { ...litellmCredentials(), apiKey: options.litellmApiKey }
    : litellmCredentials();

  return ChatCompletionFactory.createInstance(credentials, {
    model: selectedModel,
    temperature,
    streaming,
    reasoning,
  });
};

// Organization-aware version — uses org's LiteLLM virtual key for per-team budget tracking
export const createChatCompletionInstanceWithOrg = async (
  options: ChatCompletionOptions,
  orgId: string,
  streaming: boolean = true,
): Promise<LanguageModelV3> => {
  const orgKey = await getLiteLLMOrgApiKey(orgId);

  const credentials: LiteLLMCredentials = orgKey
    ? { ...litellmCredentials(), apiKey: orgKey }
    : litellmCredentials();

  const rawModel =
    options.model || options.modelName || defaultModel() || undefined;
  const selectedModel = rawModel ? normalizeModelId(rawModel) : undefined;

  let temperature = options.temperature;
  if (selectedModel && !supportsTemperature(selectedModel)) {
    if (temperature !== undefined) {
      logger.info(
        { model: selectedModel, temperature },
        'Temperature parameter excluded for model that does not support it',
      );
    }
    temperature = undefined;
  }

  const reasoning = selectedModel ? isReasoningModel(selectedModel) : false;

  return ChatCompletionFactory.createInstance(credentials, {
    model: selectedModel,
    temperature,
    streaming,
    reasoning,
  });
};

// Embeddings via LiteLLM proxy (Cohere Embed v3 Multilingual on Bedrock)
export const createEmbeddingsInstance = ({
  organizationId,
  litellmApiKey,
}: {
  organizationId?: string;
  litellmApiKey?: string;
} = {}) => {
  const credentials: LiteLLMCredentials = litellmApiKey
    ? { ...litellmCredentials(), apiKey: litellmApiKey }
    : litellmCredentials();

  return EmbeddingsFactory.createInstance(
    credentials,
    {
      model: process.env.EMBEDDING_MODEL || 'cohere-embed-multilingual-v3',
    },
    organizationId,
  );
};

// Content moderation using OpenAI Moderation API directly
// Uses dedicated OPENAI_MODERATION_KEY with fallback to OPENAI_API_KEY
export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
}

export const createModerationInstance = (orgApiKey?: string) => {
  const apiKey =
    orgApiKey ||
    process.env.OPENAI_MODERATION_KEY ||
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Cannot create moderation instance: set OPENAI_MODERATION_KEY or OPENAI_API_KEY',
    );
  }

  const openaiClient = new OpenAI({ apiKey });

  return {
    async invoke({ input }: { input: string }): Promise<{
      results: ModerationResult[];
    }> {
      const response = await openaiClient.moderations.create({
        input,
      });

      return {
        results: response.results.map((r) => ({
          flagged: r.flagged,
          categories: r.categories as unknown as Record<string, boolean>,
        })),
      };
    },
  };
};

export type ModerationInstance = ReturnType<typeof createModerationInstance>;
