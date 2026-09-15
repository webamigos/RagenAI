import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAzure } from '@ai-sdk/azure';
import { createVertex } from '@ai-sdk/google-vertex';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
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
      ...(credentials.apiVersion ? { apiVersion: credentials.apiVersion } : {}),
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
      // The route wins: a regional default cannot serve a model that only
      // exists on another endpoint. See `Route.location`.
      location: route.location ?? credentials.location,
      // `VERTEX_CREDENTIALS` holds the service account itself, which is the
      // proxy's convention; Google's libraries would otherwise look for a file
      // path in `GOOGLE_APPLICATION_CREDENTIALS` and find nothing. Omitted when
      // unset, so application default credentials — a Cloud Run or GCE service
      // identity — still work with no variable at all.
      ...(credentials.serviceAccount
        ? { googleAuthOptions: { credentials: credentials.serviceAccount } }
        : {}),
    })(route.model),

  openai: (route, credentials) =>
    createOpenAI({
      apiKey: credentials.apiKey,
      // Unset for OpenAI proper; set only by a deployment pointing at a
      // gateway or a regional endpoint that still speaks OpenAI's own API.
      baseURL: credentials.baseUrl,
    })(route.model),

  /**
   * Anthropic's own API, for a deployment holding a plain Anthropic key rather
   * than access to Bedrock or Vertex. The same models reach Ragen three ways —
   * this, `bedrock` (`eu.anthropic.*`) and `vertex` — and which one a
   * deployment uses is a routing decision, which is why it belongs in the
   * table and not in code.
   *
   * Chat only. Anthropic publishes no embeddings endpoint, so this provider is
   * deliberately absent from `EMBEDDING_PROVIDER_FACTORIES` — see the note
   * there.
   */
  anthropic: (route, credentials) =>
    createAnthropic({
      apiKey: credentials.apiKey,
      // Unset means Anthropic proper. Set for a regional endpoint or a
      // gateway that speaks Anthropic's own API rather than OpenAI's.
      baseURL: credentials.baseUrl,
    })(route.model),

  'openai-compatible': (route, credentials) =>
    createOpenAICompatible({
      // The name is required by the provider and surfaces in error messages
      // and telemetry, so it is the connection rather than a constant — a
      // deployment running two upstreams can tell them apart.
      name: route.connection ?? 'openai-compatible',
      baseURL: credentials.baseUrl!,
      apiKey: credentials.apiKey,
      // Applied after the bearer token, so a connection can add routing or
      // attribution headers without displacing its own authentication.
      headers: credentials.headers,
    })(route.model),
};
