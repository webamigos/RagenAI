import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScalewayKMSService } from '../scaleway-kms';

const originalFetch = globalThis.fetch;

function respond(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

beforeEach(() => {
  process.env.SCW_API_KEY = 'scw-secret';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.SCW_API_KEY;
  delete process.env.SCW_KEY_MANAGER_REGION;
  vi.useRealTimers();
});

describe('ScalewayKMSService', () => {
  it('requires an API key', () => {
    delete process.env.SCW_API_KEY;

    expect(() => new ScalewayKMSService()).toThrow(/SCW_API_KEY/);
  });

  it('calls the regional endpoint with the auth header', async () => {
    const fetchMock = respond({
      plaintext: Buffer.alloc(32, 1).toString('base64'),
      ciphertext: 'wrapped',
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await new ScalewayKMSService({ region: 'nl-ams' }).generateDataKey('key-9');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.scaleway.com/key-manager/v1alpha1/regions/nl-ams/keys/key-9/generate-data-key',
    );
    expect((init.headers as Record<string, string>)['X-Auth-Token']).toBe(
      'scw-secret',
    );
  });

  it('rejects a DEK that is not 32 bytes', async () => {
    // Only apps/worker's copy checked this. Without it the bad key reaches
    // createDecipheriv and fails as an opaque "Invalid key length".
    globalThis.fetch = respond({
      plaintext: Buffer.alloc(16, 1).toString('base64'),
    }) as unknown as typeof fetch;

    await expect(
      new ScalewayKMSService().decryptDataKey('key-9', 'wrapped'),
    ).rejects.toThrow(/expected 32 bytes, got 16/);
  });

  it('surfaces a non-2xx response with its body', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('key not found', { status: 404 }),
    ) as unknown as typeof fetch;

    await expect(
      new ScalewayKMSService().decryptDataKey('key-9', 'wrapped'),
    ).rejects.toThrow(/failed \(404\): key not found/);
  });

  it('times out rather than hanging a Temporal activity', async () => {
    // The reason the worker's copy had a timeout at all: this call sits
    // inside an activity, and a hung fetch holds the slot until Temporal's
    // own timeout fires, much later and with a less useful message.
    globalThis.fetch = vi.fn(
      (_url: unknown, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;

    await expect(
      new ScalewayKMSService({ requestTimeoutMs: 10 }).decryptDataKey(
        'key-9',
        'wrapped',
      ),
    ).rejects.toThrow(/timed out after 10ms/);
  });
});
