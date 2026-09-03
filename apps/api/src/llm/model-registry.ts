/**
 * This app's view of the shared LLM catalogue.
 *
 * The catalogue itself lives in `@ragenai/platform-contracts` (ADR-33). This
 * file used to be a hand-maintained copy of ragen-app's, carrying a comment
 * asking the next reader to keep the two in sync; it is now a re-export, so
 * every `../llm/model-registry.js` import in this app keeps working unchanged.
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
