import type { EmbeddingModelV4, LanguageModelV4 } from '@ai-sdk/provider';

import { providerIsConfigured } from './credentials-from-env';
import { EMBEDDING_PROVIDER_FACTORIES } from './embedding-providers';
import { PROVIDER_FACTORIES } from './providers';
import {
  probeModels,
  type ModelProbe,
  type ModelProbeState,
  type ProbeOptions,
} from './probe';
import { findRoute } from './route-table';
import type {
  DescribedModel,
  CredentialScope,
  CredentialSource,
  EmbeddingProviderFactory,
  ProviderFactory,
  ProviderId,
  Route,
  RouteTable,
} from './types';

export class UnknownModelError extends Error {
  constructor(modelId: string) {
    super(`no route for model "${modelId}"`);
    this.name = 'UnknownModelError';
  }
}

/**
 * A route points at a provider that serves chat but not embeddings —
 * `anthropic` today, which publishes no embeddings endpoint.
 *
 * Its own error rather than `UnknownModelError`: the model id *is* routed, and
 * telling an operator "no route for …" would send them to the route table to
 * add an entry that is already there. What is wrong is the entry's provider.
 */
export class EmbeddingsUnsupportedError extends Error {
  constructor(modelId: string, provider: string) {
    super(
      `"${modelId}" routes to ${provider}, which serves no embedding models`,
    );
    this.name = 'EmbeddingsUnsupportedError';
  }
}

export type GatewayOptions = {
  readonly routes: RouteTable;
  readonly credentials: CredentialSource;
  /**
   * Whether this deployment has credentials for a provider. Injected so the
   * gateway can answer "what can we actually serve" without building a model
   * or throwing — and so a credential source that is not the environment can
   * answer it differently.
   *
   * Defaults to the environment check. A source that returns `true` for
   * everything simply makes `availableModels` equal to every route, which is
   * the old behaviour.
   */
  readonly isConfigured?: (
    provider: ProviderId,
    connection?: string,
  ) => boolean;
  /** Overridable so a test can resolve a model without reaching a provider. */
  readonly factories?: Partial<Record<ProviderId, ProviderFactory>>;
  /** As `factories`, for embeddings. */
  readonly embeddingFactories?: Partial<
    Record<ProviderId, EmbeddingProviderFactory>
  >;
};

/**
 * Turn a model id into a language model.
 *
 * Deliberately **not** reading `MODEL_REGISTRY`: that is the catalogue the UI
 * renders — display names, visibility, capability flags — and it answers a
 * different question from "where does this model actually live". Keeping them
 * apart is what lets a deployment serve a model the picker does not show, and
 * show one it routes somewhere unusual. See B1 in the spec.
 */
export class LlmGateway {
  private readonly routes: RouteTable;
  private readonly credentials: CredentialSource;
  private readonly factories: Record<ProviderId, ProviderFactory>;
  private readonly embeddingFactories: Partial<
    Record<ProviderId, EmbeddingProviderFactory>
  >;
  private readonly isConfigured: (
    provider: ProviderId,
    connection?: string,
  ) => boolean;

  constructor(options: GatewayOptions) {
    this.routes = options.routes;
    this.credentials = options.credentials;
    this.factories = { ...PROVIDER_FACTORIES, ...options.factories };
    this.embeddingFactories = {
      ...EMBEDDING_PROVIDER_FACTORIES,
      ...options.embeddingFactories,
    };
    this.isConfigured = options.isConfigured ?? providerIsConfigured;
  }

  /**
   * Whether this deployment serves the model — routed **and** configured.
   *
   * Both halves matter. The shipped route table describes Ragen's own
   * installation, so a deployment holding one provider's credentials has
   * routes it cannot honour. Answering on the table alone would put those
   * models in the picker and turn the first click into a credentials error.
   */
  serves(modelId: string): boolean {
    const route = findRoute(this.routes, modelId);
    if (!route) {
      return false;
    }
    return this.isConfigured(route.provider, route.connection);
  }

  /**
   * The route a model id takes, or `undefined`.
   *
   * Exposed because a caller sometimes needs the *provider family* before the
   * model exists — `reasoningEffortOptions` is gated on it, and asking for that
   * by resolving the model first would build a provider client just to read a
   * string off the route.
   */
  routeFor(modelId: string): Route | undefined {
    return findRoute(this.routes, modelId);
  }

  /**
   * Whether the upstreams behind these model ids answer and list them — a free
   * `GET /models`, for `openai-compatible` routes only. See `probeModels`.
   */
  probe(
    modelIds: readonly string[],
    options?: ProbeOptions,
  ): Promise<ModelProbe[]> {
    return probeModels(this.routes, this.credentials, modelIds, options);
  }

  private readonly probeCache = new Map<
    string,
    { at: number; state: ModelProbeState }
  >();

  /**
   * The model ids whose server answered and does not have them — on Ollama, a
   * model nobody pulled. For the picker, which should not offer a model whose
   * first call is certain to fail.
   *
   * Only `missing`, never `unreachable`: a server that is briefly down would
   * otherwise empty the picker, and the setup checklist already says it is
   * down. Results are cached per id for `ttlMs` (30 s), because the picker
   * asks on every page load and a server's set of models changes when an
   * operator pulls one, not between two requests.
   */
  async missingModels(
    modelIds: readonly string[],
    options: ProbeOptions & { ttlMs?: number; now?: () => number } = {},
  ): Promise<Set<string>> {
    const now = options.now?.() ?? Date.now();
    const ttlMs = options.ttlMs ?? 30_000;
    const stale = modelIds.filter((id) => {
      const cached = this.probeCache.get(id);
      return !cached || now - cached.at >= ttlMs;
    });
    if (stale.length > 0) {
      const probes = await this.probe(stale, {
        fetch: options.fetch,
        timeoutMs: options.timeoutMs ?? 1500,
      });
      for (const probe of probes) {
        this.probeCache.set(probe.modelId, { at: now, state: probe.state });
      }
    }
    return new Set(
      modelIds.filter((id) => this.probeCache.get(id)?.state === 'missing'),
    );
  }

  /** Every model this deployment can actually answer with. */
  availableModels(): string[] {
    return Object.keys(this.routes)
      .filter((modelId) => this.serves(modelId))
      .sort();
  }

  /**
   * The served routes that describe themselves with `display`.
   *
   * Served, not merely routed, for the same reason as `availableModels`: a
   * described route whose upstream is not configured would put a model in the
   * picker that fails on the first click. A route with no `capabilities` has
   * none, so it is never offered as a chat model by accident.
   */
  describedModels(): DescribedModel[] {
    return this.availableModels().flatMap((id) => {
      const route = this.routes[id];
      if (!route?.display) {
        return [];
      }
      return [
        {
          id,
          displayName: route.display,
          capabilities: route.capabilities ?? [],
        },
      ];
    });
  }

  async resolveModel(
    modelId: string,
    options?: { scope?: CredentialScope },
  ): Promise<LanguageModelV4> {
    const { route, credentials } = await this.route(modelId, options?.scope);
    return this.factories[route.provider](route, credentials);
  }

  /**
   * The same routing, for an embedding model.
   *
   * Two proxy-era workarounds do **not** come across, and their absence is
   * deliberate rather than an omission. apps/web deleted `encoding_format` from
   * every embedding request to dodge a LiteLLM/Bedrock-Cohere bug that sent
   * `embedding_types` as a string; apps/worker forced it to `float` because
   * Scaleway's vLLM rejects it missing. Both are the proxy's, and they
   * contradict each other. The AI SDK's OpenAI-compatible embedding model
   * always sends `encoding_format: "float"`, which is what the upstream wanted
   * in the first place — so the worker's rule is the default here and the web's
   * has nothing left to work around.
   */
  async resolveEmbeddingModel(
    modelId: string,
    options?: { scope?: CredentialScope },
  ): Promise<EmbeddingModelV4> {
    const route = findRoute(this.routes, modelId);
    if (!route) {
      throw new UnknownModelError(modelId);
    }

    /**
     * Before the credentials, not after. A provider that serves no embeddings
     * serves none whether or not this deployment holds its key, so loading
     * credentials first answers `MissingCredentialsError` — which sends an
     * operator to set a variable that would change nothing.
     */
    const factory = this.embeddingFactories[route.provider];
    if (!factory) {
      throw new EmbeddingsUnsupportedError(modelId, route.provider);
    }

    return factory(route, await this.credentialsFor(route, options?.scope));
  }

  private async route(modelId: string, scope?: CredentialScope) {
    const route = findRoute(this.routes, modelId);
    if (!route) {
      throw new UnknownModelError(modelId);
    }

    return { route, credentials: await this.credentialsFor(route, scope) };
  }

  private async credentialsFor(route: Route, scope?: CredentialScope) {
    return this.credentials.forProvider(route.provider, {
      connection: route.connection,
      scope,
    });
  }
}
