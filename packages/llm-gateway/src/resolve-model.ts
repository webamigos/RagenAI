import type { LanguageModelV4 } from '@ai-sdk/provider';

import { providerIsConfigured } from './credentials-from-env';
import { PROVIDER_FACTORIES } from './providers';
import { findRoute } from './route-table';
import type {
  CredentialScope,
  CredentialSource,
  ProviderFactory,
  ProviderId,
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
  private readonly isConfigured: (
    provider: ProviderId,
    connection?: string,
  ) => boolean;

  constructor(options: GatewayOptions) {
    this.routes = options.routes;
    this.credentials = options.credentials;
    this.factories = { ...PROVIDER_FACTORIES, ...options.factories };
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
    const route = findRoute(this.routes, modelId);
    if (!route) {
      throw new UnknownModelError(modelId);
    }

    const credentials = await this.credentials.forProvider(route.provider, {
      connection: route.connection,
      scope: options?.scope,
    });

    return this.factories[route.provider](route, credentials);
  }
}
