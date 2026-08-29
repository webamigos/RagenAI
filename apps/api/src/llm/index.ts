export { ChatCompletionFactory } from './chat-completion-factory.js';
export {
  EmbeddingsFactory,
  TrackedEmbeddingsProvider,
} from './embeddings-factory.js';
export {
  type BaseCompletionConfig,
  type ChatCompletionOptions,
  type ModelConfig,
  type ModelProvider,
  type LiteLLMCredentials,
  type ProviderCredentials,
  type BaseEmbeddingsConfig,
  type EmbeddingsProvider,
} from './types/index.js';
export {
  MODEL_REGISTRY,
  supportsReasoningEffort,
  type AvailableModel,
  type ModelOrigin,
  type ModelRegistryEntry,
} from './model-registry.js';
