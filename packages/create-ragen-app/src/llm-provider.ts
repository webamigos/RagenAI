import type { RouteTableEntry } from './route-table';

/**
 * The route table shipped in the repo wires Azure OpenAI, AWS Bedrock, Google
 * Vertex and Scaleway — accounts a new self-hoster mostly does not have. These
 * entries let the wizard take one key and produce a working install instead.
 *
 * Ordered by how far one key gets you, which is not the same as how well known
 * the vendor is:
 *
 * - `openrouter` — one key, most of the catalogue, and embeddings, so chat and
 *   the knowledge base both work.
 * - `scaleway` — the same, on EU infrastructure, and the set Ragen's own demo
 *   runs. The reason it is offered here rather than left to the shipped table:
 *   it *is* in that table, but only as routes an installer has no key for, so
 *   a new install could see the models and reach none of them.
 * - `openai` — the commonest key there is; chat and embeddings.
 * - `anthropic` — chat only. Anthropic publishes no embeddings endpoint, so
 *   the knowledge base does not work on this key alone and the wizard says so.
 */
export type LlmProviderChoice =
  'openrouter' | 'scaleway' | 'openai' | 'anthropic';

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
  /** Passed through to the route, for an `openai-compatible` upstream. */
  connection?: string;
  /**
   * A second value the provider cannot work without, asked for after the key.
   *
   * Scaleway is the case: its base URL carries the project id
   * (`https://api.scaleway.ai/<project>/v1`), so a key alone produces an
   * install that looks configured and 404s on the first turn. Providers whose
   * endpoint is a constant leave this undefined and are still one prompt.
   */
  baseUrl?: { envVar: string; prompt: string };
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
  openrouter: {
    label: 'OpenRouter (one key, most models)',
    apiKeyEnvVar: 'OPENROUTER_API_KEY',
    // Namespaced upstream, plain here: the model id is what the application
    // and the catalogue use, and `model` is the upstream's own name. Keeping
    // the slash out of the key also keeps it out of URLs and log lines.
    modelName: 'claude-haiku-4-5-openrouter',
    gatewayProvider: 'openrouter',
    upstreamModel: 'anthropic/claude-haiku-4.5',
    embeddings: {
      modelName: 'text-embedding-3-small-openrouter',
      upstreamModel: 'openai/text-embedding-3-small',
      vectorSize: 1536,
    },
  },
  scaleway: {
    label: 'Scaleway (EU infrastructure)',
    apiKeyEnvVar: 'SCW_API_KEY',
    baseUrl: {
      envVar: 'SCW_API_BASE',
      prompt:
        'Paste your Scaleway Generative APIs base URL (https://api.scaleway.ai/<project-id>/v1)',
    },
    // The set Ragen's own demo runs. Both ids already exist in the shipped
    // route table under `connection: scaleway`, so this writes the same routes
    // the repository ships rather than inventing names.
    modelName: 'mistral-small-3.2',
    gatewayProvider: 'openai-compatible',
    connection: 'scaleway',
    upstreamModel: 'mistral-small-3.2-24b-instruct-2506',
    embeddings: {
      modelName: 'bge-multilingual-gemma2',
      upstreamModel: 'bge-multilingual-gemma2',
      // 3584 is `DEFAULT_VECTOR_SIZE` in rag-core, and it is this model's.
      // The one Scaleway choice that needs no VECTOR_SIZE override — every
      // other provider here does, and getting it wrong makes Qdrant reject
      // every upsert rather than degrade.
      vectorSize: 3584,
    },
  },
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
  baseUrl?: string,
): LlmProviderChoiceResult {
  const config = LLM_PROVIDERS[choice];

  const envUpdates: Record<string, string> = {
    [config.apiKeyEnvVar]: apiKey,
    ...(config.baseUrl && baseUrl ? { [config.baseUrl.envVar]: baseUrl } : {}),
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
      ...(config.connection ? { connection: config.connection } : {}),
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
      ...(config.connection ? { connection: config.connection } : {}),
    });
  }

  return {
    envUpdates,
    routes,
    embeddingsConfigured: Boolean(config.embeddings),
  };
}
