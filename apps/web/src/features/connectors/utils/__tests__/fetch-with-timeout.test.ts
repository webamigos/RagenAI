/**
 * The address policy reaches the API-key registration POST.
 *
 * That request carries the user's key to a URL assembled from a catalogue
 * row, and it went through the global `fetch` with no check at all — the one
 * remaining path where an operator-typed address was dialled unguarded.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGuardedFetch = vi.fn();
const mockClose = vi.fn();
const mockCreateGuardedFetch = vi.fn();
vi.mock('@ragenai/connector-guard', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    createGuardedFetch: (...args: unknown[]) =>
      mockCreateGuardedFetch(...args) as unknown,
  };
});

const { fetchWithTimeout } = await import('../fetch-with-timeout');

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockGuardedFetch.mockReset().mockResolvedValue(new Response('{}'));
    mockClose.mockReset().mockResolvedValue(undefined);
    mockCreateGuardedFetch
      .mockReset()
      .mockReturnValue({ fetch: mockGuardedFetch, close: mockClose });
  });

  it('sends a guarded address through the policy, not the global fetch', async () => {
    const globalFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    await fetchWithTimeout('https://typed.example.test/register', {
      method: 'POST',
      addressGuard: { allowPrivate: false },
    });

    expect(mockCreateGuardedFetch).toHaveBeenCalledTimes(1);
    expect(mockGuardedFetch).toHaveBeenCalledTimes(1);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it('closes the dispatcher afterwards, so a call does not leak a socket', async () => {
    await fetchWithTimeout('https://typed.example.test/register', {
      addressGuard: { allowPrivate: false },
    });

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('closes it even when the request throws', async () => {
    mockGuardedFetch.mockRejectedValue(new Error('refused'));

    await expect(
      fetchWithTimeout('https://typed.example.test/register', {
        addressGuard: { allowPrivate: false },
      }),
    ).rejects.toThrow('refused');
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('carries the entry allowsPrivateAddress setting into the policy', async () => {
    await fetchWithTimeout('https://typed.example.test/register', {
      addressGuard: { allowPrivate: true },
    });

    const [options] = mockCreateGuardedFetch.mock.calls[0] as [
      { isBlockedAddress: (address: string) => boolean },
    ];
    // RFC 1918 is admitted under the flag; loopback never is, whatever it says.
    expect(options.isBlockedAddress('10.0.0.5')).toBe(false);
    expect(options.isBlockedAddress('127.0.0.1')).toBe(true);
  });

  it('reads the body before closing the dispatcher, not after', async () => {
    // `close()` waits for the request to finish, and the request does not
    // finish until the body is read — so closing first deadlocks on any body
    // larger than the socket buffer. This pins the order.
    const upstream = new Response('{"status":"ok"}', { status: 200 });
    mockGuardedFetch.mockResolvedValue(upstream);

    let bodyWasReadWhenClosed: boolean | undefined;
    mockClose.mockImplementation(() => {
      bodyWasReadWhenClosed = upstream.bodyUsed;
      return Promise.resolve();
    });

    const response = await fetchWithTimeout(
      'https://typed.example.test/register',
      { addressGuard: { allowPrivate: false } },
    );

    expect(bodyWasReadWhenClosed).toBe(true);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('keeps the status and headers of the buffered response', async () => {
    mockGuardedFetch.mockResolvedValue(
      new Response('nope', {
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'content-type': 'text/plain' },
      }),
    );

    const response = await fetchWithTimeout(
      'https://typed.example.test/register',
      { addressGuard: { allowPrivate: false } },
    );

    expect(response.ok).toBe(false);
    expect(response.status).toBe(502);
    expect(response.headers.get('content-type')).toBe('text/plain');
    await expect(response.text()).resolves.toBe('nope');
  });

  it('leaves a response that has no body alone', async () => {
    // `new Response(body, { status: 204 })` throws, so a bodyless answer has
    // to pass straight through.
    mockGuardedFetch.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await fetchWithTimeout(
      'https://typed.example.test/register',
      { addressGuard: { allowPrivate: false } },
    );

    expect(response.status).toBe(204);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('refuses a body past the buffering limit rather than holding it', async () => {
    // The timeout caps how long an endpoint may answer for, not how much it
    // sends in that time, so the read counts bytes itself.
    const chunk = new Uint8Array(256 * 1024);
    let sent = 0;
    mockGuardedFetch.mockResolvedValue(
      new Response(
        new ReadableStream({
          pull(controller) {
            if (sent >= 8) {
              controller.close();
              return;
            }
            sent += 1;
            controller.enqueue(chunk);
          },
        }),
      ),
    );

    await expect(
      fetchWithTimeout('https://typed.example.test/register', {
        addressGuard: { allowPrivate: false },
      }),
    ).rejects.toThrow(/exceeded 1048576 bytes/);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('reads a body that fits, across several chunks', async () => {
    const encoder = new TextEncoder();
    mockGuardedFetch.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('{"status":'));
            controller.enqueue(encoder.encode('"ok"}'));
            controller.close();
          },
        }),
      ),
    );

    const response = await fetchWithTimeout(
      'https://typed.example.test/register',
      { addressGuard: { allowPrivate: false } },
    );

    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('leaves a deployer-controlled URL on the plain fetch', async () => {
    const globalFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    await fetchWithTimeout('http://localhost:8000/auth/google');

    expect(mockCreateGuardedFetch).not.toHaveBeenCalled();
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });
});
