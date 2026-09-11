import type { LiteLLMModelEntry } from './litellm-config';

/**
 * The `infra/litellm/config.yaml` shipped in the repo only wires Azure
 * OpenAI, AWS Bedrock, Google Vertex and Scaleway — none of which a new
 * self-hoster can use in five minutes. These two entries let the wizard
 * paste a plain OpenAI or Anthropic key and get a working model instead.
 */
export type LlmProviderChoice = 'openai' | 'anthropic';

export interface LlmEmbeddingsConfig {
  modelName: string;
  litellmModel: string;
  /** Output dimensionality — must match `VECTOR_SIZE`, see rag-core's vector contract. */
  vectorSize: number;
}

export interface LlmProviderConfig {
  label: string;
  apiKeyEnvVar: string;
  modelName: string;
  litellmModel: string;
  /**
   * Undefined for a provider with no embeddings API of its own. Chat still
   * works; the knowledge base does not, because retrieval has nothing to
   * embed a query with. The wizard says so rather than leaving the shipped
   * Scaleway default in place and letting the first upload fail with a 404
   * for a model the install has no credentials for.
   */
  embeddings?: LlmEmbeddingsConfig;
}

export const LLM_PROVIDERS: Record<LlmProviderChoice, LlmProviderConfig> = {
  openai: {
    label: 'OpenAI',
    apiKeyEnvVar: 'OPENAI_API_KEY',
    modelName: 'gpt-4o-mini',
    litellmModel: 'openai/gpt-4o-mini',
    embeddings: {
      modelName: 'text-embedding-3-small',
      litellmModel: 'openai/text-embedding-3-small',
      vectorSize: 1536,
    },
  },
  anthropic: {
    label: 'Anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    // Not "claude-haiku-4-5" — packages/platform-contracts/src/llm/model-catalog.ts
    // already uses that name for the (commented) Bedrock deployment of the
    // same model. Two model_list entries sharing a model_name become one
    // load-balanced pool in LiteLLM, silently mixing direct-Anthropic and
    // Bedrock traffic under Bedrock's catalog metadata.
    modelName: 'claude-haiku-4-5-direct',
    litellmModel: 'anthropic/claude-haiku-4-5-20251001',
    // Anthropic ships no embeddings endpoint, so there is nothing to point
    // EMBEDDINGS_MODEL at with this key alone.
  },
};

export interface LlmProviderChoiceResult {
  envUpdates: Record<string, string>;
  liteLLMEntries: LiteLLMModelEntry[];
  /** False when the picked provider cannot serve embeddings — the caller warns. */
  embeddingsConfigured: boolean;
}

export function resolveLlmProviderChoice(
  choice: LlmProviderChoice,
  apiKey: string,
): LlmProviderChoiceResult {
  const config = LLM_PROVIDERS[choice];

  const envUpdates: Record<string, string> = {
    [config.apiKeyEnvVar]: apiKey,
    DEFAULT_MODEL: config.modelName,
    DEFAULT_MODEL_PROVIDER: 'litellm',
    // .env.example ships gemini-2.5-flash here, which needs Vertex
    // credentials. Multi-query expansion is on by default (ADR-15), so
    // leaving it would fail the RAG chain on its *first* step — before the
    // model the user just configured is ever reached.
    REPHRASE_MODEL: config.modelName,
  };

  const liteLLMEntries: LiteLLMModelEntry[] = [
    {
      modelName: config.modelName,
      model: config.litellmModel,
      apiKeyEnvVar: config.apiKeyEnvVar,
    },
  ];

  if (config.embeddings) {
    envUpdates.EMBEDDINGS_MODEL = config.embeddings.modelName;
    // VECTOR_SIZE and EMBEDDINGS_MODEL have to agree or Qdrant rejects every
    // upsert — rag-core's vector contract says so, and its default (3584)
    // belongs to the Scaleway model being replaced here.
    envUpdates.VECTOR_SIZE = String(config.embeddings.vectorSize);
    liteLLMEntries.push({
      modelName: config.embeddings.modelName,
      model: config.embeddings.litellmModel,
      apiKeyEnvVar: config.apiKeyEnvVar,
    });
  }

  return {
    envUpdates,
    liteLLMEntries,
    embeddingsConfigured: Boolean(config.embeddings),
  };
}
