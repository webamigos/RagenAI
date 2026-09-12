import { lookup as systemLookup, type LookupAddress } from 'node:dns';
import { Agent } from 'undici';
import { isPrivateOrLoopbackAddress } from './private-address.js';

/**
 * Outbound guard for user-supplied connector URLs (DNS rebinding / SSRF).
 *
 * `normalizeSiteUrl` can only reject what is written in the URL. A shop
 * hostname that resolves to 169.254.169.254 looks perfectly public at parse
 * time, so the check has to happen again where the socket is opened.
 *
 * Two properties matter here:
 *
 *  - **Check at connect time.** The resolver's answer is validated, not the
 *    string the user typed.
 *  - **Pin the answer.** undici's `Agent({ connect: { lookup } })` connects to
 *    the exact addresses this lookup hands back, so nothing can change
 *    between the check and the connect. Redirects travel through the same
 *    dispatcher, so a 302 to an internal host is blocked too.
 *
 * Scoped to one dispatcher rather than `setGlobalDispatcher`, because
 * apps/api legitimately fetches localhost services (LiteLLM on 4000,
 * ragen-token-vault on 3100, apps/web's internal API).
 */

/** Matches `@modelcontextprotocol/sdk`'s `FetchLike`. */
export type GuardedFetch = (
  url: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/** Also used to recognise the error after a wrapper has flattened it. */
export const BLOCKED_ADDRESS_ERROR_NAME = 'BlockedAddressError';

export class BlockedAddressError extends Error {
  constructor(
    readonly hostname: string,
    readonly address: string,
  ) {
    super(
      `Refusing to connect to ${hostname}: it resolves to the private or loopback address ${address}`,
    );
    this.name = BLOCKED_ADDRESS_ERROR_NAME;
  }
}

type LookupFn = typeof systemLookup;

export interface GuardedFetchOptions {
  /** Resolver to use. Injected by tests; defaults to the system resolver. */
  lookup?: LookupFn;
  /** Address policy. Injected by tests; defaults to the real policy. */
  isBlockedAddress?: (address: string) => boolean;
}

/**
 * Wrap a resolver so it rejects the whole lookup if *any* returned address is
 * private. Rejecting the batch rather than filtering matters: with
 * `autoSelectFamily` Node races several candidates, so a mixed
 * public + private answer would still reach the private one.
 */
export function createGuardedLookup(
  options: GuardedFetchOptions = {},
): LookupFn {
  const resolve = options.lookup ?? systemLookup;
  const isBlocked = options.isBlockedAddress ?? isPrivateOrLoopbackAddress;

  const guarded = (
    hostname: string,
    optionsOrCallback: unknown,
    maybeCallback?: unknown,
  ): void => {
    const callback = (
      typeof optionsOrCallback === 'function'
        ? optionsOrCallback
        : maybeCallback
    ) as (
      error: NodeJS.ErrnoException | null,
      addressOrAddresses?: string | LookupAddress[],
      family?: number,
    ) => void;
    const lookupOptions = (
      typeof optionsOrCallback === 'function' ? {} : (optionsOrCallback ?? {})
    ) as { all?: boolean };

    // Always resolve with `all`, so every candidate address is inspected —
    // not just the one Node would have picked.
    resolve(
      hostname,
      { ...lookupOptions, all: true },
      (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => {
        if (error) {
          callback(error);
          return;
        }
        if (!addresses || addresses.length === 0) {
          callback(
            Object.assign(new Error(`No addresses found for ${hostname}`), {
              code: 'ENOTFOUND',
            }),
          );
          return;
        }
        const blocked = addresses.find((entry) => isBlocked(entry.address));
        if (blocked) {
          callback(new BlockedAddressError(hostname, blocked.address));
          return;
        }
        if (lookupOptions.all) {
          callback(null, addresses);
          return;
        }
        callback(null, addresses[0].address, addresses[0].family);
      },
    );
  };

  return guarded as unknown as LookupFn;
}

/**
 * A `fetch` that refuses to reach private networks, plus the dispatcher it
 * owns. Always `close()` when done — the dispatcher holds sockets.
 */
export function createGuardedFetch(options: GuardedFetchOptions = {}): {
  fetch: GuardedFetch;
  close: () => Promise<void>;
} {
  const agent = new Agent({
    connect: { lookup: createGuardedLookup(options) },
  });

  return {
    fetch: (url, init) => {
      // `dispatcher` is undici's own extension to RequestInit; Node's global
      // fetch honours it at runtime but the DOM lib type does not declare it,
      // so it is attached through a widened local type rather than inline.
      const guardedInit: RequestInit & { dispatcher: Agent } = {
        ...init,
        dispatcher: agent,
      };
      return fetch(url, guardedInit);
    },
    close: () => agent.close(),
  };
}
