/**
 * Ported from apps/web's
 * src/features/connectors/utils/fetch-with-timeout.ts, and kept identical to
 * it. See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
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
    return await send(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
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
