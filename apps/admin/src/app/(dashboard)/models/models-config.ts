/**
 * This app's view of the shared LLM catalogue.
 *
 * The catalogue lives in `@ragenai/platform-contracts` (ADR-33). This file used
 * to hardcode its own list, and it had drifted into a different namespace
 * entirely — provider-prefixed IDs (`openai/gpt-5.3-chat`) where LiteLLM serves
 * unprefixed ones (`gpt-5.3-chat`). Since `getAvailableModelsForOrganization()`
 * filters LiteLLM's own IDs against `allowedModels`, a value that matches
 * nothing did not narrow an organization's model picker — it emptied it.
 */
import {
  selectableModels,
  type ModelOrigin,
} from '@ragenai/platform-contracts';

export type { ModelOrigin };

export type ModelDefinition = {
  value: string;
  label: string;
  origin: ModelOrigin;
};

/**
 * The models a platform administrator may put on an organization's allowlist —
 * the ones a user can actually pick in chat. Entries the registry marks
 * internal (rephrase, summary, embeddings, reranking) are never chosen by a
 * user, so allowing or denying them per organization has no meaning.
 */
export const allModels: ModelDefinition[] = selectableModels().map((model) => ({
  value: model.value,
  label: model.displayName,
  origin: model.origin,
}));

export const originDisplayNames: Record<ModelOrigin, string> = {
  openai: 'OpenAI',
  google: 'Google',
  anthropic: 'Anthropic',
  mistral: 'Mistral',
};

export const originOrder: ModelOrigin[] = [
  'openai',
  'google',
  'anthropic',
  'mistral',
];

export function groupModelsByOrigin(models: ModelDefinition[]) {
  const grouped: Record<string, ModelDefinition[]> = {};
  for (const model of models) {
    if (!grouped[model.origin]) {
      grouped[model.origin] = [];
    }
    grouped[model.origin].push(model);
  }
  return originOrder
    .filter((origin) => grouped[origin])
    .map((origin) => ({
      origin,
      displayName: originDisplayNames[origin],
      models: grouped[origin],
    }));
}
