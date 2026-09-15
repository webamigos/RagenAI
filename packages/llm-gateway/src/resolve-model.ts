import type { EmbeddingModelV4, LanguageModelV4 } from '@ai-sdk/provider';

import { providerIsConfigured } from './credentials-from-env';
import { EMBEDDING_PROVIDER_FACTORIES } from './embedding-providers';
import { PROVIDER_FACTORIES } from './providers';
import { findRoute } from './route-table';
import type {
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
  private readonly embeddingFactories: Record<
    ProviderId,
    EmbeddingProviderFactory
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

  /** Every model this deployment can actually answer with. */
  availableModels(): string[] {
    return Object.keys(this.routes)
      .filter((modelId) => this.serves(modelId))
      .sort();
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
    const { route, credentials } = await this.route(modelId, options?.scope);
    return this.embeddingFactories[route.provider](route, credentials);
  }

  private async route(modelId: string, scope?: CredentialScope) {
    const route = findRoute(this.routes, modelId);
    if (!route) {
      throw new UnknownModelError(modelId);
    }

    const credentials = await this.credentials.forProvider(route.provider, {
      connection: route.connection,
      scope,
    });

    return { route, credentials };
  }
}
