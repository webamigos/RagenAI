import type { ProviderDefinition } from '../contracts/connector.types';
import { PROVIDER_LIST, getProvider } from '../providers/registry';

/** @deprecated Prefer `PROVIDER_LIST` from `../providers/registry`. */
export const CONNECTOR_PROVIDERS: readonly ProviderDefinition[] = PROVIDER_LIST;

/**
 * Returns the manifest for a catalogue slug, or `undefined` when no manifest
 * carries that slug — a connector added from the admin panel has none, and for
 * the length of the expand/contract a row can still name a slug this build has
 * never heard of. `undefined` rather than a throw, as it always was.
 */
export const getProviderDefinition = (
  provider: string,
): ProviderDefinition | undefined => {
  return getProvider(provider);
};
