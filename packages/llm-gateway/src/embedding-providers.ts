import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAzure } from '@ai-sdk/azure';
import { createVertex } from '@ai-sdk/google-vertex';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { EmbeddingModelV4 } from '@ai-sdk/provider';

import type { ProviderCredentials, ProviderId, Route } from './types';

/**
 * One factory per provider family, for embeddings.
 *
 * A separate table from `PROVIDER_FACTORIES` rather than a flag on it, because
 * the two answer different questions about the same route. A route says where a
 * model lives; whether that model is a chat model or an embedding model is a
 * property of the model, and the caller already knows which one it wants —
 * `embedMany` is never reached by accident from a chat path.
 *
 * The route table therefore needs no `kind` field, and gains none here: adding
 * one would ask an operator to restate something the model id already says, and
 * would be wrong for the upstreams that serve both from one endpoint.
 */
export const EMBEDDING_PROVIDER_FACTORIES: Record<
  ProviderId,
  (route: Route, credentials: ProviderCredentials) => EmbeddingModelV4
> = {
  azure: (route, credentials) =>
    createAzure({
      apiKey: credentials.apiKey,
      baseURL: credentials.baseUrl,
    }).textEmbeddingModel(route.model),

  bedrock: (route, credentials) =>
    createAmazonBedrock({
      region: credentials.region,
    }).textEmbeddingModel(route.model),

  vertex: (route, credentials) =>
    createVertex({
      project: credentials.project,
      // The route wins: a regional default cannot serve a model that only
      // exists on another endpoint. See `Route.location`.
      location: route.location ?? credentials.location,
      ...(credentials.serviceAccount
        ? { googleAuthOptions: { credentials: credentials.serviceAccount } }
        : {}),
    }).textEmbeddingModel(route.model),

  openai: (route, credentials) =>
    createOpenAI({
      apiKey: credentials.apiKey,
      baseURL: credentials.baseUrl,
    }).textEmbeddingModel(route.model),

  'openai-compatible': (route, credentials) =>
    createOpenAICompatible({
      name: route.connection ?? 'openai-compatible',
      baseURL: credentials.baseUrl!,
      apiKey: credentials.apiKey,
      // Applied after the bearer token, so a connection can add routing or
      // attribution headers without displacing its own authentication.
      headers: credentials.headers,
    }).textEmbeddingModel(route.model),
};
