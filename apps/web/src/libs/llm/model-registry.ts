/**
 * This app's view of the shared LLM catalogue.
 *
 * The catalogue itself lives in `@ragenai/platform-contracts` (ADR-33) because
 * apps/api and apps/admin resolve the same model IDs and used to keep their own
 * copies of this file. Re-exported rather than imported directly at every call
 * site so the ~40 existing `@/libs/llm/model-registry` imports did not have to
 * change.
 *
 * Models not in the registry use inferred defaults (visible, auto-labeled).
 * Internal models (rephrase, rerank, embeddings) are marked as not visible.
 */
export {
  MODEL_REGISTRY,
  isReasoningModel,
  normalizeModelId,
  selectableModels,
  supportsReasoningEffort,
} from '@ragenai/platform-contracts';

export type {
  AvailableModel,
  ModelOrigin,
  ModelProvider,
  ModelRegistryEntry,
} from '@ragenai/platform-contracts';
