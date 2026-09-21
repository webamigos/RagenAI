import { lookup as systemLookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import { Agent, buildConnector } from 'undici';
import { isPrivateOrLoopbackAddress } from './private-address';

/**
 * Outbound guard for user-supplied connector URLs (DNS rebinding / SSRF).
 *
 * `normalizeSiteUrl` can only reject what is written in the URL. A shop
 * hostname that resolves to 169.254.169.254 looks perfectly public at parse
 * time, so the check has to happen again where the socket is opened.
 *
 * Three properties matter here:
 *
 *  - **Check at connect time.** The resolver's answer is validated, not the
 *    string the user typed.
 *  - **Pin the answer.** The lookup hands undici the exact addresses it
 *    validated, so nothing can change between the check and the connect.
 *  - **Guard the socket, not the resolver.** Node calls `lookup` only for a
 *    host that needs resolving, so an IP literal reaches `net.connect`
 *    without it. The checks therefore live in a `connect` connector, which
 *    runs for *every* socket the dispatcher opens — including each redirect
 *    hop, since redirects travel through the same dispatcher.
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

/** Also used to recognise the error after a wrapper has flattened it. */
export const INSECURE_PROTOCOL_ERROR_NAME = 'InsecureProtocolError';

/**
 * A hop asked for a scheme the guard does not speak.
 *
 * Connector URLs are https at registration, but `Location` is not checked by
 * anything: a 302 to `http://` would put the customer's API key — a custom
 * header, which `fetch` does not strip the way it strips `Authorization` —
 * on the wire in clear text.
 */
export class InsecureProtocolError extends Error {
  constructor(
    readonly hostname: string,
    readonly protocol: string,
  ) {
    super(
      `Refusing to connect to ${hostname} over ${protocol}: only https is allowed`,
    );
    this.name = INSECURE_PROTOCOL_ERROR_NAME;
  }
}

type LookupFn = typeof systemLookup;

export interface GuardedFetchOptions {
  /** Resolver to use. Injected by tests; defaults to the system resolver. */
  lookup?: LookupFn;
  /** Address policy. Injected by tests; defaults to the real policy. */
  isBlockedAddress?: (address: string) => boolean;
  /**
   * Schemes a hop may use. Defaults to https only — a redirect must not
   * downgrade the scheme a connector was registered with. Callers that dial a
   * URL somebody typed pass `protocolsFor(url)`; tests that speak plain http
   * to a local server pass `['http:']` explicitly.
   */
  allowedProtocols?: string[];
}

/**
 * The schemes a connector's own URL may use, given the scheme it was saved
 * with.
 *
 * The https-only default is right for a *redirect* and wrong for the *first
 * hop*. Both `/mcp-catalogue`'s form and `probeMcpServer` deliberately accept
 * `http://` — an operator's MCP server on their own network often has no
 * certificate, and the address policy, not the scheme, is what decides whether
 * it may be reached.
 *
 * Without this the three runtime call sites kept the default and so refused
 * what the form had accepted and **Test connection had just reported
 * working**, naming the server's tools as it did so. That is that button's
 * purpose exactly inverted: it exists so an operator can tell a working
 * endpoint from a typo before a customer does.
 *
 * An https entry still gets https alone, so a redirect cannot downgrade it.
 * An http entry may be redirected *up* to https — not a downgrade, and what a
 * server that has just been put behind TLS does.
 */
export type ProtocolPolicy = {
  /**
   * The session carries a credential — a bearer token, an OAuth access token,
   * or a custom header holding an API key. Only `server_side` connectors do
   * not.
   */
  credentialed?: boolean;
  /**
   * The entry is declared to live on the operator's own network
   * (`allowsPrivateAddress`), which is a platform-admin decision and audited
   * where it is set.
   */
  allowPrivate?: boolean;
};

export function protocolsFor(
  url: string,
  policy: ProtocolPolicy = {},
): string[] {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    // Unparseable here means unconnectable later. Keep the strict default
    // rather than widening on an input nothing validated.
    return ['https:'];
  }

  if (protocol !== 'http:') {
    return ['https:'];
  }

  /**
   * A credential never travels in clear text.
   *
   * `api_key_bearer` sends the *customer's own* third-party key and
   * `external_mcp` sends an OAuth access token, so http for either puts a
   * secret on the wire.
   *
   * **`allowPrivate` is deliberately not an exception here**, and the reason
   * is worth stating because the first version of this made it one.
   * `allowPrivate` *widens* the address policy to admit RFC 1918 — it does not
   * *confine* the entry to it. A public hostname still resolves and connects
   * with the flag on, so "the operator declared this internal" is not evidence
   * that the hop is internal, and a policy resting on it would leak a
   * customer's key to a public host while claiming not to.
   *
   * Confining it properly means judging the *resolved* address, which is known
   * only inside the connector below, after the lookup. Until that exists, a
   * credentialed connector needs TLS — see the follow-up in
   * docs/specs/2026-09-21-create-ragen-connector.md.
   *
   * `server_side` carries no credential and is unaffected, which is the shape
   * ADR-52 names as the reason an operator's own http server matters.
   */
  if (policy.credentialed) {
    return ['https:'];
  }

  return ['http:', 'https:'];
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

/** `URL.hostname` keeps the brackets on an IPv6 literal; `isIP` does not. */
function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '');
}

/**
 * The connector the guarded dispatcher opens every socket through.
 *
 * It exists because the `lookup` hook alone is not a guard. `net.connect`
 * calls `lookup` only when the host has to be resolved, so `https://evil` →
 * `302 http://127.0.0.1:4000/` connects straight to the private service: the
 * literal never reaches the resolver. A connector runs on every socket, with
 * no such gap.
 *
 * Hostnames still go through the pinning lookup underneath, so the DNS
 * rebinding property is kept rather than replaced.
 */
export function createGuardedConnector(
  options: GuardedFetchOptions = {},
): buildConnector.connector {
  const isBlocked = options.isBlockedAddress ?? isPrivateOrLoopbackAddress;
  const allowedProtocols = options.allowedProtocols ?? ['https:'];
  const connect = buildConnector({ lookup: createGuardedLookup(options) });

  return (connectOptions, callback) => {
    const { hostname, protocol } = connectOptions;

    if (!allowedProtocols.includes(protocol)) {
      callback(new InsecureProtocolError(hostname, protocol), null);
      return;
    }

    // A literal is judged here and now — there is no resolver step to judge
    // it in. A name falls through to the lookup, which judges its answer.
    const literal = stripBrackets(hostname);
    if (isIP(literal) && isBlocked(literal)) {
      callback(new BlockedAddressError(hostname, literal), null);
      return;
    }

    connect(connectOptions, callback);
  };
}

/**
 * A `fetch` that refuses to reach private networks, plus the dispatcher it
 * owns. Always `close()` when done — the dispatcher holds sockets.
 */
export function createGuardedFetch(options: GuardedFetchOptions = {}): {
  fetch: GuardedFetch;
  close: () => Promise<void>;
} {
  const agent = new Agent({ connect: createGuardedConnector(options) });

  return {
    fetch: (url, init) => {
      // `dispatcher` is undici's own extension to RequestInit; Node's global
      // fetch honours it at runtime but the DOM lib type does not declare it.
      //
      // It is attached through a cast rather than a widened local type
      // because two views of undici's `Dispatcher` are in scope in this
      // package — `undici`'s own and the `undici-types` copy bundled with
      // `@types/node` — and they are structurally identical but nominally
      // distinct. The cast asserts the shape the runtime actually reads.
      const guardedInit = {
        ...init,
        dispatcher: agent,
      } as unknown as RequestInit;
      return fetch(url, guardedInit);
    },
    close: () => agent.close(),
  };
}
