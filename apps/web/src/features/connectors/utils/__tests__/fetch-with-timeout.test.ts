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

  it('leaves a deployer-controlled URL on the plain fetch', async () => {
    const globalFetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    await fetchWithTimeout('http://localhost:8000/auth/google');

    expect(mockCreateGuardedFetch).not.toHaveBeenCalled();
    expect(globalFetch).toHaveBeenCalledTimes(1);
  });
});
