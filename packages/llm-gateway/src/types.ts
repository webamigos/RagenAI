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
  /**
   * Where the model lives, for a provider whose endpoint is regional.
   *
   * Vertex only. Overrides `VERTEX_LOCATION` for this one route, because a
   * deployment's default region is not where every model is: Google serves
   * preview models from the `global` endpoint only, so `gemini-3-flash-preview`
   * 404s in `europe-central2` while `gemini-2.5-flash` answers there. The proxy
   * config has always encoded this per model — `vertex_location: global` sits
   * on exactly that entry — and a route table without it cannot express the
   * installation it replaces.
   */
  readonly location?: string;
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
  /**
   * A parsed Google service account, for Vertex.
   *
   * The proxy reads one from `VERTEX_CREDENTIALS` as a JSON blob, and matching
   * its variable names is the whole reason a deployment needs no new secrets to
   * try the gateway. Google's own libraries look for a *file path* in
   * `GOOGLE_APPLICATION_CREDENTIALS` instead, so without this the two paths do
   * not in fact read the same configuration — see `serviceAccountFromEnv`.
   */
  readonly serviceAccount?: Record<string, unknown>;
  /**
   * Extra request headers, for an OpenAI-compatible upstream that needs more
   * than a bearer token to know what to do.
   *
   * This is what makes "attach any OpenAI-compatible gateway" true rather than
   * nearly true. Portkey routes on `x-portkey-provider` or `x-portkey-config`;
   * OpenRouter attributes traffic with `HTTP-Referer` and `X-Title`; several
   * hosted gateways select a deployment the same way. A base URL and a key
   * cannot express any of it, so without this the promise holds for LiteLLM and
   * vLLM and quietly fails for the rest.
   */
  readonly headers?: Record<string, string>;
  /**
   * Azure's `api-version` query parameter.
   *
   * Azure OpenAI dates its API and refuses a request whose version predates the
   * feature it uses, so the proxy has always passed `AZURE_API_VERSION`
   * explicitly. Reading `AZURE_API_KEY` and `AZURE_API_BASE` while ignoring the
   * third variable is the same mistake `VERTEX_CREDENTIALS` was — two thirds of
   * a provider's configuration adopted, and the missing third only noticed on a
   * real call.
   */
  readonly apiVersion?: string;
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
