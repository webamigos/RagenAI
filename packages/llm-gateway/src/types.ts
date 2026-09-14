import type { EmbeddingModelV4, LanguageModelV4 } from '@ai-sdk/provider';

/** The provider families the gateway can route to. */
export const PROVIDER_IDS = [
  'azure',
  'bedrock',
  'vertex',
  'openai',
  'openai-compatible',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/**
 * One entry of the route table: how a model id the application uses reaches a
 * real upstream.
 *
 * `model` is the upstream's own name and is deliberately separate from the key
 * it is filed under. They agree today for most models and will not always:
 * Bedrock spells Cohere's reranker `cohere.rerank-v3-5:0`, and an
 * OpenAI-compatible endpoint is free to name anything anything.
 */
export type Route = {
  readonly provider: ProviderId;
  readonly model: string;
  /**
   * Which set of credentials to use, for providers that can have more than one
   * upstream — `openai-compatible` covers Scaleway, vLLM, Ollama, TGI and a
   * LiteLLM proxy, and a deployment may run several at once. Omitted for the
   * single-tenant providers, whose credentials are unambiguous.
   *
   * `openai` is separate from `openai-compatible` on purpose. OpenAI itself
   * can be reached through the compatible provider by pointing a base URL at
   * it, and that works — but "I have an OpenAI key and nothing else" is the
   * commonest self-host case there is, and making it spell out a base URL for
   * the one endpoint everybody already knows is a poor first five minutes.
   * `@ai-sdk/openai` also handles OpenAI's own quirks the generic client does
   * not.
   */
  readonly connection?: string;
};

export type RouteTable = Readonly<Record<string, Route>>;

/** Credentials for one upstream, in the shape its provider factory needs. */
export type ProviderCredentials = {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly region?: string;
  readonly resourceName?: string;
  readonly project?: string;
  readonly location?: string;
};

/**
 * Where credentials come from.
 *
 * This is an interface rather than a function reading `process.env` directly,
 * and that is the whole point of it. Today there is one implementation, backed
 * by environment variables, and one key per provider for the whole deployment.
 * The known next step is per-organization and per-team keys held in
 * ragen-token-vault, which is already the service that holds per-org secrets
 * (ADR-13 for API keys, ADR-32 for connector tokens) — that arrives as a second
 * implementation taking a scope, not as an edit to every call site.
 *
 * `scope` is threaded through now, unused by the env source, so the signature
 * does not have to change when it starts mattering.
 */
export type CredentialSource = {
  forProvider(
    provider: ProviderId,
    options?: { connection?: string; scope?: CredentialScope },
  ): Promise<ProviderCredentials>;
};

/** Who the call is being made for, once keys stop being deployment-wide. */
export type CredentialScope = {
  readonly organizationId?: string;
  readonly teamId?: string;
};

/** Builds a language model from credentials — one per provider family. */
export type ProviderFactory = (
  route: Route,
  credentials: ProviderCredentials,
) => LanguageModelV4;

/** The same, for embeddings. */
export type EmbeddingProviderFactory = (
  route: Route,
  credentials: ProviderCredentials,
) => EmbeddingModelV4;
