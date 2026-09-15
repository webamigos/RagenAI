import { z } from 'zod';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import OpenAI from 'openai';
import type { ChatCompletionOptions } from '@/libs/llm/types/chat-completion';
import { isReasoningModel, normalizeModelId } from '../../components/config';
import { logger } from '../utils/logger';
import { resolveEmbeddingsModel } from '@ragenai/rag-core';
import {
  nativeChatInstance,
  nativeEmbeddingInstance,
} from '@/libs/llm/native-models';
import { TrackedEmbeddingsProvider } from '@/libs/llm/embeddings-factory';

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

function getDefaultModel(): string {
  const config = modelsSchema.parse({
    provider: process.env.DEFAULT_MODEL_PROVIDER,
    model: process.env.DEFAULT_MODEL,
  });
  return config.model;
}

// Lazy-initialized (deferred to first use, not import time)
let _defaultModel: string | null = null;

function defaultModel(): string {
  if (!_defaultModel) {
    _defaultModel = getDefaultModel();
  }
  return _defaultModel;
}

export const createChatCompletionInstance = (
  options: ChatCompletionOptions & { litellmApiKey?: string },
  streaming: boolean = true,
): LanguageModelV4 => {
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

  return nativeChatInstance({
    model: selectedModel,
    reasoningEffort: options.reasoningEffort,
    // Normalized above: undefined for models that reject the parameter.
    temperature,
  });
};

/**
 * Organization-scoped: the org is a credential *scope*, which is all it was
 * left as. Per-org LiteLLM virtual keys carried the proxy's own budget, the
 * application has enforced those ceilings since Phase A, and B5 removed the
 * keys.
 */
export const createChatCompletionInstanceWithOrg = async (
  options: ChatCompletionOptions,
  orgId: string,
): Promise<LanguageModelV4> => {
  const rawModelId =
    options.model || options.modelName || defaultModel() || undefined;
  return nativeChatInstance({
    model: rawModelId ? normalizeModelId(rawModelId) : undefined,
    reasoningEffort: options.reasoningEffort,
    organizationId: orgId,
  });
};

export const createEmbeddingsInstance = ({
  organizationId,
  userId,
  projectId,
}: {
  organizationId?: string;
  userId?: string;
  projectId?: string;
} = {}) => {
  const embeddingsModel = resolveEmbeddingsModel();

  // `litellm` is the pricing namespace `calculateCost` looks under, and it
  // holds the whole catalogue — Scaleway, Vertex and Bedrock models alike.
  // Writing the real upstream here finds no entry and records every embedding
  // at **zero**, which the monthly cost ceiling is then computed from. The
  // name outlived the proxy; moving it is B6b, and it moves with the pricing
  // table or not at all.
  return new TrackedEmbeddingsProvider(
    nativeEmbeddingInstance(embeddingsModel, organizationId),
    embeddingsModel,
    'litellm',
    organizationId,
    userId,
    projectId,
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
