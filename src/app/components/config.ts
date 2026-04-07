export {
  MODEL_REGISTRY,
  type ModelProvider,
  type ModelOrigin,
  type ModelRegistryEntry,
} from '@/libs/llm/model-registry';

import {
  MODEL_REGISTRY,
  type ModelOrigin,
  type ModelProvider,
} from '@/libs/llm/model-registry';

export const LOCAL_STORAGE_THREAD_KEY = 'threadId';
export const SESSION_STORAGE_TEMP_MESSAGE_KEY = 'tempMessage';

export type AvailableModel = {
  value: string;
  label: string;
  provider: ModelProvider;
  origin: ModelOrigin;
  reasoning?: boolean;
};

// Static fallback list — the real model list is fetched dynamically from LiteLLM /models endpoint.
// These are used when LiteLLM is unreachable and must match model_name values in litellm/config.yaml.
// Only includes visible (user-facing) models.
export const availableModels: AvailableModel[] = Object.entries(MODEL_REGISTRY)
  .filter(([, entry]) => entry.visible)
  .map(([id, entry]) => ({
    value: id,
    label: entry.displayName,
    provider: 'litellm' as const,
    origin: entry.origin,
    reasoning: entry.reasoning,
  }));

/** Normalize a model ID — pass through as-is (no legacy models to map) */
export const normalizeModelId = (modelValue: string): string => {
  return modelValue;
};

export const getModelProvider = (_modelValue: string): ModelProvider => {
  return 'litellm';
};

export const isReasoningModel = (modelValue: string): boolean => {
  const entry = MODEL_REGISTRY[modelValue];
  if (entry) {
    return entry.reasoning === true;
  }
  return availableModels.some(
    (model) => model.value === modelValue && model.reasoning === true,
  );
};

const originDisplayNames: Record<ModelOrigin, string> = {
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
};

export const getProviderDisplayName = (_provider: ModelProvider): string => {
  return 'LiteLLM';
};

/** Group models by their visual origin (OpenAI, Google, Anthropic, etc.) for the model selector UI */
export const groupModelsByOrigin = (
  models: AvailableModel[],
): Array<{
  origin: ModelOrigin;
  displayName: string;
  models: AvailableModel[];
}> => {
  const grouped = models.reduce(
    (acc, model) => {
      const origin = model.origin;
      if (!acc[origin]) {
        acc[origin] = {
          origin,
          displayName: originDisplayNames[origin],
          models: [],
        };
      }
      acc[origin].models.push(model);
      return acc;
    },
    {} as Record<
      ModelOrigin,
      { origin: ModelOrigin; displayName: string; models: AvailableModel[] }
    >,
  );

  const originOrder: ModelOrigin[] = ['openai', 'google', 'anthropic'];

  return originOrder
    .filter((origin) => grouped[origin])
    .map((origin) => grouped[origin]);
};
