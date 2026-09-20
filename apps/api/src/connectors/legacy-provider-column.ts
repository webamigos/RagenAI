import type { McpConnectorProvider } from '../generated/prisma/client.js';

/**
 * Narrows a catalogue slug to the `McpConnectorProvider` enum, for the one
 * column that still requires it. Sibling of apps/web's
 * `features/connectors/utils/legacy-provider-column.ts`; see it for why the
 * cast is sound while it exists, and when this file goes.
 */
export function legacyProviderColumn(slug: string): McpConnectorProvider {
  return slug as McpConnectorProvider;
}
