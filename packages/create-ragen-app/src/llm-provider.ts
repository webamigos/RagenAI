import type { RouteTableEntry } from './route-table';

/**
 * The route table shipped in the repo only wires Azure OpenAI, AWS Bedrock,
 * Google Vertex and Scaleway — none of which a new self-hoster can use in five
 * minutes. These two entries let the wizard paste a plain OpenAI or Anthropic
 * key and get a working model instead.
 */
export type LlmProviderChoice = 'openai' | 'anthropic';

export interface LlmEmbeddingsConfig {
  modelName: string;
  /** The upstream's own name, for the route table. */
  upstreamModel: string;
  /** Output dimensionality — must match `VECTOR_SIZE`, see rag-core's vector contract. */
  vectorSize: number;
}

export interface LlmProviderConfig {
  label: string;
  apiKeyEnvVar: string;
  modelName: string;
  /**
   * The `@ragenai/llm-gateway` provider that serves this key directly, and the
   * upstream's own name for the model. Both providers the wizard offers have
   * one, so a scaffolded install calls the provider itself — the same default
   * every other deployment gets — rather than routing through a proxy it only
   * runs because the wizard configured one.
   */
  gatewayProvider: string;
  upstreamModel: string;
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
    gatewayProvider: 'openai',
    upstreamModel: 'gpt-4o-mini',
    embeddings: {
      modelName: 'text-embedding-3-small',
      upstreamModel: 'text-embedding-3-small',
      vectorSize: 1536,
    },
  },
  anthropic: {
    label: 'Anthropic',
    apiKeyEnvVar: 'ANTHROPIC_API_KEY',
    // Not "claude-haiku-4-5" — packages/platform-contracts/src/llm/model-catalog.ts
    // already uses that name for the Bedrock deployment of the same model, and
    // the route table is a map: a second entry under that key would silently
    // replace the first, so a scaffolded install would take over a catalogue
    // name it does not own and serve it from a different account.
    modelName: 'claude-haiku-4-5-direct',
    gatewayProvider: 'anthropic',
    upstreamModel: 'claude-haiku-4-5-20251001',
    // Anthropic ships no embeddings endpoint, so there is nothing to point
    // EMBEDDINGS_MODEL at with this key alone. The gateway says the same
    // thing in its own shape: `anthropic` has no entry in
    // EMBEDDING_PROVIDER_FACTORIES, and a route pointing there raises
    // EmbeddingsUnsupportedError rather than failing inside the AI SDK.
  },
};

export interface LlmProviderChoiceResult {
  envUpdates: Record<string, string>;
  /**
   * The route table this installation gets. Written over the one shipped in
   * the repository, which names providers a new install has no keys for.
   */
  routes: RouteTableEntry[];
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
    // The pricing namespace `AiUsage` writes against, where the whole
    // catalogue lives under `litellm` — not a gateway any more. The provider
    // that actually served a turn is recorded separately as `servedBy`.
    DEFAULT_MODEL_PROVIDER: 'litellm',
    // .env.example ships gemini-2.5-flash here, which needs Vertex
    // credentials. Multi-query expansion is on by default (ADR-15), so
    // leaving it would fail the RAG chain on its *first* step — before the
    // model the user just configured is ever reached.
    REPHRASE_MODEL: config.modelName,
  };

  // The route table is the whole configuration now. There is no second place
  // to keep in step and no flag to roll back to — #1194 removed the proxy path
  // and the variable that chose it.
  const routes: RouteTableEntry[] = [
    {
      modelName: config.modelName,
      provider: config.gatewayProvider,
      model: config.upstreamModel,
    },
  ];

  if (config.embeddings) {
    envUpdates.EMBEDDINGS_MODEL = config.embeddings.modelName;
    // VECTOR_SIZE and EMBEDDINGS_MODEL have to agree or Qdrant rejects every
    // upsert — rag-core's vector contract says so, and its default (3584)
    // belongs to the Scaleway model being replaced here.
    envUpdates.VECTOR_SIZE = String(config.embeddings.vectorSize);
    routes.push({
      modelName: config.embeddings.modelName,
      provider: config.gatewayProvider,
      model: config.embeddings.upstreamModel,
    });
  }

  return {
    envUpdates,
    routes,
    embeddingsConfigured: Boolean(config.embeddings),
  };
}
