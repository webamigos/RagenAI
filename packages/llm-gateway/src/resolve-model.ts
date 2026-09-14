import type { LanguageModelV4 } from '@ai-sdk/provider';

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

  constructor(options: GatewayOptions) {
    this.routes = options.routes;
    this.credentials = options.credentials;
    this.factories = { ...PROVIDER_FACTORIES, ...options.factories };
  }

  /** Whether this deployment serves the model at all. */
  serves(modelId: string): boolean {
    return findRoute(this.routes, modelId) !== undefined;
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
