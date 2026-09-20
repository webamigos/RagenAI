import type { McpConnectorProvider } from '@/generated/prisma/client';

/**
 * Narrows a catalogue slug to the `McpConnectorProvider` enum, for the one
 * column that still requires it.
 *
 * `McpConnector.provider` and `McpOAuthToken.provider` are mid-expand/contract:
 * every reader is on `providerSlug` now, and every writer writes both — but
 * `provider` is still `NOT NULL` and still typed as the enum, so a write has to
 * produce an enum value from a string.
 *
 * The cast is sound while it exists, and the reason is worth being explicit
 * about rather than leaving to the reader of an `as`: every writer resolves a
 * manifest before it writes, and a slug with no manifest never reaches a write.
 * That stops being true the moment an operator can create an entry (Phase C),
 * which is why B3 stops writing this column and B5 drops it — this file goes
 * with it.
 */
export function legacyProviderColumn(slug: string): McpConnectorProvider {
  return slug as McpConnectorProvider;
}
