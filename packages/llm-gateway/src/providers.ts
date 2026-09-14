import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAzure } from '@ai-sdk/azure';
import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModelV4 } from '@ai-sdk/provider';

import type { ProviderCredentials, ProviderId, Route } from './types';

/**
 * One factory per provider family. Each is a thin adapter: take the route and
 * its credentials, hand back a language model. No routing decisions here —
 * those belong to the route table, which is configuration.
 */
export const PROVIDER_FACTORIES: Record<
  ProviderId,
  (route: Route, credentials: ProviderCredentials) => LanguageModelV4
> = {
  azure: (route, credentials) =>
    createAzure({
      apiKey: credentials.apiKey,
      baseURL: credentials.baseUrl,
    })(route.model),

  bedrock: (route, credentials) =>
    createAmazonBedrock({
      region: credentials.region,
      // Credentials come from the default AWS provider chain — the env keys
      // the proxy already uses, an instance role, or SSO — rather than being
      // threaded through here. `AWS_BEDROCK_REGION` is the one value the chain
      // cannot supply, because the proxy named it differently from AWS_REGION.
    })(route.model),

  vertex: (route, credentials) =>
    createVertex({
      project: credentials.project,
      location: credentials.location,
      // Same reasoning as Bedrock: application default credentials, which is
      // what VERTEX_CREDENTIALS already points at.
    })(route.model),

  'openai-compatible': (route, credentials) =>
    createOpenAICompatible({
      // The name is required by the provider and surfaces in error messages
      // and telemetry, so it is the connection rather than a constant — a
      // deployment running two upstreams can tell them apart.
      name: route.connection ?? 'openai-compatible',
      baseURL: credentials.baseUrl!,
      apiKey: credentials.apiKey,
    })(route.model),
};
