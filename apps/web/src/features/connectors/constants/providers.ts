import type { McpConnectorProvider } from '@/generated/prisma/client';
import type { ProviderDefinition } from '../contracts/connector.types';
import { PROVIDER_LIST, getProvider } from '../providers/registry';

/** @deprecated Prefer `PROVIDER_LIST` from `../providers/registry`. */
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
