import { createGuardedFetch, isBlockedAddress } from '@ragenai/connector-guard';

import type { ProviderDefinition } from '../contracts/connector.types';

/**
 * The address policy for the OAuth hops, which run before any MCP session.
 *
 * `blockedAddressReason` checks the hostname in the URL, which is all a URL
 * can answer. `mcpAuth()` then performs protected-resource discovery and the
 * token exchange against that server — requests the guarded transport never
 * sees, because there is no transport yet — so a hostname that *resolves* to
 * a private address passed the string check and was dialled anyway, and a
 * redirect inside those hops was not checked at all.
 *
 * Giving `mcpAuth` this `fetchFn` puts the resolved-address check back in the
 * path, on every hop, which is what the rest of the connector code already
 * does. A built-in resolved from `MCP_*_SERVER_URL` carries no `addressGuard`
 * and stays on the plain fetch, as those endpoints always were.
 *
 * Closing is safe once `auth()` has resolved: it reads each response body
 * before returning, so nothing is left in flight for the dispatcher's
 * graceful close to wait on. (That ordering is the subject of
 * docs/lessons/closing-a-dispatcher-waits-for-a-body-nobody-is-reading.md.)
 */
export function guardedAuthFetch(definition: ProviderDefinition): {
  fetchFn?: typeof fetch;
  close: () => Promise<void>;
} {
  const guard = definition.addressGuard;

  if (!guard) {
    return { close: async () => {} };
  }

  const guarded = createGuardedFetch({
    isBlockedAddress: (address) =>
      isBlockedAddress(address, { allowPrivate: guard.allowPrivate }),
  });

  return {
    // `createGuardedFetch` hands back the MCP SDK's `FetchLike` shape, which
    // takes `string | URL` where the DOM type also allows a `Request`. Every
    // caller here passes a URL, and the dispatcher is what actually matters.
    fetchFn: guarded.fetch as unknown as typeof fetch,
    close: guarded.close,
  };
}
