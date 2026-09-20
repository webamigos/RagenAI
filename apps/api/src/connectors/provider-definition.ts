import type { ProviderDefinition } from './types.js';
import { PROVIDER_LIST, getProvider } from './providers/registry.js';

/**
 * Ported verbatim from apps/web's
 * src/features/connectors/constants/providers.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 */

export const CONNECTOR_PROVIDERS: readonly ProviderDefinition[] = PROVIDER_LIST;

/**
 * Returns the manifest for a catalogue slug, or `undefined` when no manifest
 * carries that slug. `undefined` rather than a throw, as it always was.
 */
export const getProviderDefinition = (
  provider: string,
): ProviderDefinition | undefined => {
  return getProvider(provider);
};
