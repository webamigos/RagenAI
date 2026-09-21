import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { isBlockedAddress, type AddressPolicy } from './private-address';
import {
  createGuardedMcpTransport,
  isBlockedAddressError,
  isInsecureProtocolError,
} from './guarded-mcp-transport';

/**
 * Open an MCP session against a URL somebody typed and list its tools.
 *
 * It is the only way an operator can tell a working MCP endpoint from a typo
 * before a customer does, and it doubles as the evidence that the server
 * speaks MCP at all.
 *
 * It is also an outbound request to an address the caller just typed, so it is
 * bounded rather than open-ended: a connect deadline and a list deadline, and
 * the client and its transport closed on every exit — success, failure,
 * timeout and cancellation alike. Without that, one unresponsive endpoint
 * holds a request open for as long as it cares to.
 */
export type McpProbeResult =
  { ok: true; toolNames: string[] } | { ok: false; reason: string };

export type McpProbeOptions = AddressPolicy & {
  headers?: Record<string, string>;
  /**
   * Address policy. Injected by tests, and by nothing else — the same seam
   * `GuardedFetchOptions` carries, for the same reason: a test's server is on
   * loopback, which the real policy refuses whatever `allowPrivate` says.
   */
  isBlockedAddress?: (address: string) => boolean;
  /** Per-phase deadline. Two phases, so the worst case is twice this. */
  timeoutMs?: number;
  /** Cancels the probe from outside — a caller navigating away, say. */
  signal?: AbortSignal;
};

const DEFAULT_TIMEOUT_MS = 5_000;

export async function probeMcpServer(
  url: string,
  options: McpProbeOptions = {},
): Promise<McpProbeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'That is not a valid URL.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'The URL must be http:// or https://.' };
  }

  const guarded = createGuardedMcpTransport(url, options.headers ?? {}, {
    isBlockedAddress:
      options.isBlockedAddress ??
      ((address) =>
        isBlockedAddress(address, { allowPrivate: options.allowPrivate })),
    // A probe of a URL an operator is still typing may legitimately be plain
    // http — an internal server on their own network often is — and the
    // address policy is what decides whether it may be reached, not the
    // scheme. The stored entry is checked by the same policy at connect time.
    allowedProtocols: [parsed.protocol],
  });

  const client = new Client(
    { name: 'ragen-catalogue-probe', version: '1.0.0' },
    { capabilities: {} },
  );

  try {
    await withDeadline(
      client.connect(guarded.transport),
      timeoutMs,
      'The server did not answer in time.',
      options.signal,
    );

    const listed = await withDeadline(
      client.listTools(),
      timeoutMs,
      'The server connected but did not list its tools in time.',
      options.signal,
    );

    return { ok: true, toolNames: listed.tools.map((tool) => tool.name) };
  } catch (error) {
    return { ok: false, reason: describe(error) };
  } finally {
    // Both, in this order, and neither allowed to mask the other: the client
    // owns the session and the guard owns an undici dispatcher, which keeps
    // its sockets until it is closed.
    await close(() => client.close());
    await close(guarded.close);
  }
}

function describe(error: unknown): string {
  if (isBlockedAddressError(error)) {
    return 'That address is refused by the connector address policy — it resolved somewhere private or reserved.';
  }
  if (isInsecureProtocolError(error)) {
    return 'The server redirected to a scheme this connector may not follow.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'The connection failed for an unknown reason.';
}

async function close(closer: () => Promise<void> | void): Promise<void> {
  try {
    await closer();
  } catch {
    // A probe that fails to clean up must not turn into a probe that failed.
  }
}

function withDeadline<T>(
  work: Promise<T>,
  timeoutMs: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    const onAbort = () => reject(new Error('The check was cancelled.'));

    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
    }

    work.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    });
  });
}
