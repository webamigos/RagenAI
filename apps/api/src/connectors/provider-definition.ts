import { type McpConnectorProvider } from '../generated/prisma/client.js';
import type { ProviderDefinition } from './types.js';
import { PROVIDER_LIST, getProvider } from './providers/registry.js';

/**
 * Ported verbatim from apps/web's
 * src/features/connectors/constants/providers.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 */

export const CONNECTOR_PROVIDERS: readonly ProviderDefinition[] = PROVIDER_LIST;

/**
 * Returns the manifest for a given provider, or `undefined` when the
 * value is not a recognised `McpConnectorProvider`. Kept returning
 * `undefined` instead of throwing to preserve legacy caller behaviour.
 */
export const getProviderDefinition = (
  provider: McpConnectorProvider,
): ProviderDefinition | undefined => {
  return getProvider(provider);
};
