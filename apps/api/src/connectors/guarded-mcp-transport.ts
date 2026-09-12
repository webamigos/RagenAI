import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  BLOCKED_ADDRESS_ERROR_NAME,
  BlockedAddressError,
  createGuardedFetch,
  type GuardedFetchOptions,
} from './guarded-fetch.js';

/**
 * An MCP transport for a **user-supplied** server URL, connected through the
 * SSRF-guarded dispatcher.
 *
 * Why not the `{ type: 'http', url, headers }` shorthand `@ai-sdk/mcp`
 * accepts: that shorthand builds the package's own internal transport, which
 * calls global `fetch` and exposes no hook for a custom `fetch` or dispatcher.
 * `@ai-sdk/mcp` exports the `MCPTransport` *interface* but no transport class,
 * so the only ways to inject a guarded fetch were to reimplement ~290 lines of
 * Streamable-HTTP transport (SSE reconnection, resumption tokens, OAuth
 * retry) or to bring in a transport that already accepts one.
 * `@modelcontextprotocol/sdk`'s `StreamableHTTPClientTransport` does, and it
 * satisfies `@ai-sdk/mcp`'s `MCPTransport` structurally — no cast needed. Both
 * transports follow redirects by default, so behaviour is unchanged.
 *
 * A process-wide `setGlobalDispatcher` was not an option: apps/api
 * legitimately fetches localhost services (LiteLLM on 4000,
 * ragen-token-vault on 3100, apps/web's internal API).
 *
 * Only for URLs a customer supplied. Fixed `MCP_*_SERVER_URL` endpoints are
 * deployer-controlled and may point at loopback on purpose.
 */
export function createGuardedMcpTransport(
  url: string,
  headers: Record<string, string>,
  options: GuardedFetchOptions = {},
): {
  transport: StreamableHTTPClientTransport;
  close: () => Promise<void>;
} {
  const guarded = createGuardedFetch(options);

  return {
    transport: new StreamableHTTPClientTransport(new URL(url), {
      fetch: guarded.fetch,
      requestInit: { headers },
    }),
    close: guarded.close,
  };
}

/**
 * True when `error` (or anything in its `cause` chain) is the guard refusing
 * to connect. `fetch` wraps connect-time failures in `TypeError: fetch
 * failed`, and the MCP transport may wrap that again, so the chain has to be
 * walked rather than the top-level error inspected.
 */
export function isBlockedAddressError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    if (isBlockedLink(current)) {
      return true;
    }
    seen.add(current);
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Match on the name and the stringified form as well as the class.
 *
 * `instanceof` alone is not enough: a wrapper that does not recognise the
 * value as an `Error` re-creates it from `String(error)`, which keeps only
 * `"BlockedAddressError: <message>"` and drops the prototype. That happens
 * whenever the error crosses a realm boundary — Jest runs modules in a vm
 * sandbox, so the suite hits it — and nothing stops a future library version
 * from doing the same in production.
 */
function isBlockedLink(value: unknown): boolean {
  if (value instanceof BlockedAddressError) {
    return true;
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  const { name, message } = value as { name?: unknown; message?: unknown };
  if (name === BLOCKED_ADDRESS_ERROR_NAME) {
    return true;
  }
  return (
    typeof message === 'string' &&
    message.includes(`${BLOCKED_ADDRESS_ERROR_NAME}: `)
  );
}
