import { createGuardedFetch, isBlockedAddress } from '@ragenai/connector-guard';

const DEFAULT_TIMEOUT_MS = 10_000;

export type FetchWithTimeoutOptions = RequestInit & {
  timeoutMs?: number;
  /**
   * Present when the URL is one somebody typed — a catalogue row an operator
   * created, or a shop address a user supplied. The request then goes through
   * the SSRF policy: the resolver's own answer is checked, so a public
   * hostname that resolves to a private address is refused at connect time
   * rather than at save time only.
   *
   * Absent for a URL the deployer controls (`MCP_*_SERVER_URL`) or a fixed
   * third-party endpoint, which keeps the documented loopback exemption.
   */
  addressGuard?: { allowPrivate: boolean };
};

export async function fetchWithTimeout(
  url: string,
  options?: FetchWithTimeoutOptions,
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    addressGuard,
    ...fetchOptions
  } = options ?? {};

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const guarded = addressGuard
    ? createGuardedFetch({
        isBlockedAddress: (address) =>
          isBlockedAddress(address, {
            allowPrivate: addressGuard.allowPrivate,
          }),
      })
    : undefined;

  try {
    const send = guarded?.fetch ?? fetch;
    const response = await send(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return guarded ? await bufferBody(response) : response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    // The dispatcher owns sockets; leaving it open leaks one per call.
    await guarded?.close();
  }
}

/** Statuses the `Response` constructor refuses to attach a body to. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * Read the body here, while the dispatcher is still open.
 *
 * `fetch` resolves at the headers, so the body is still on the wire when the
 * `finally` above runs — and `Agent.close()` waits for the request to
 * *finish*, which it cannot do while the body sits unread behind
 * backpressure. Awaiting the close before the caller has the response
 * therefore hangs on any body larger than the socket buffer. Measured against
 * undici 7.29: a 1 MB body never resolves `close()`, a 16 KB one does, which
 * is why the two small-JSON callers never saw it.
 *
 * Buffering keeps the `Promise<Response>` contract those callers are written
 * against, and the abort signal still covers the read, so a body that never
 * ends is cut off at `timeoutMs` rather than held open.
 */
async function bufferBody(response: Response): Promise<Response> {
  if (!response.body || NULL_BODY_STATUSES.has(response.status)) {
    return response;
  }

  const body = await response.arrayBuffer();

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
