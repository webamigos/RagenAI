import { isBlockedHost } from '@ragenai/connector-guard';

import type { ProviderDefinition } from '../contracts/connector.types';

/**
 * The address check for the OAuth authorization hop.
 *
 * `mcpAuth()` performs discovery and token requests against the connector's
 * own server before any MCP session exists, so the guarded transport is not in
 * the path yet — and this is the first outbound request a catalogue entry
 * causes. It is a hostname check, which is what a URL can answer; the
 * resolved address is checked again by the guarded transport at connect time,
 * where DNS rebinding is caught.
 *
 * A built-in resolved from `MCP_*_SERVER_URL` carries no `addressGuard` and is
 * exempt, as those endpoints always were.
 */
export function blockedAddressReason(
  definition: ProviderDefinition,
  url: string,
): string | null {
  if (!definition.addressGuard) {
    return null;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return 'The connector URL is not a valid URL.';
  }

  if (isBlockedHost(hostname, definition.addressGuard)) {
    return definition.addressGuard.allowPrivate
      ? 'The connector URL points at a loopback, link-local or reserved address. Allowing private addresses does not allow these — cloud metadata lives there.'
      : 'The connector URL points at a private or reserved address.';
  }

  return null;
}
