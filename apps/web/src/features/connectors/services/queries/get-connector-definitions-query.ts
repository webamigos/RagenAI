import { cache } from 'react';

import type { ProviderDefinition } from '../../contracts/connector.types';
import { getProvider } from '../../providers/registry';
import { definitionFromEntry } from '../../utils/definition-from-entry';
import { getCatalogEntriesQuery } from './get-catalog-entries-query';

/**
 * Every connector this installation offers, resolved from catalogue rows.
 *
 * This is where the catalogue stops being a table nobody reads. Before it, the
 * answer to "which connectors exist" was `PROVIDER_LIST` — eleven manifests
 * compiled in. After it, the answer is rows, and a manifest is optional code
 * beside one.
 *
 * `cache()` is per-request, which is the right lifetime: a platform admin can
 * enable an entry at any moment, and a page that renders a stale catalogue for
 * the length of a deploy would be the feature not working.
 */
export const getConnectorDefinitionsQuery = cache(
  async (): Promise<ProviderDefinition[]> => {
    const entries = await getCatalogEntriesQuery();
    return entries.map((entry) =>
      definitionFromEntry(entry, getProvider(entry.slug)),
    );
  },
);

/**
 * One connector, or `undefined` when the catalogue has no enabled entry under
 * that slug — a disabled entry and a slug that was never added are the same
 * answer here, because neither may be connected.
 */
export async function resolveConnectorDefinitionQuery(
  slug: string,
): Promise<ProviderDefinition | undefined> {
  const definitions = await getConnectorDefinitionsQuery();
  return definitions.find((definition) => definition.provider === slug);
}
