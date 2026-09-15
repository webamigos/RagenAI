import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();

vi.mock('@aws-sdk/client-kms', () => ({
  // Real constructors, not arrow mocks: the provider calls `new KMSClient()`.
  KMSClient: class {
    send = send;
  },
  GenerateDataKeyCommand: class {
    constructor(public input: unknown) {}
  },
  DecryptCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { getKeyProvider, resetKeyProviderForTests } from '../key-provider';
import { KmsKeyProvider } from '../key-provider/kms-provider';
import { LocalKeyProvider } from '../key-provider/local-provider';
import { ScalewayKeyProvider } from '../key-provider/scaleway-provider';
import {
  encryptionProviderIsUnusable,
  getEncryptionProbeResult,
  probeEncryptionProvider,
  resetEncryptionProbeForTests,
} from '../probe';
import { getEncryptionStartupStatus } from '../require-encryption';

const ENV_KEYS = [
  'ENCRYPTION_PROVIDER',
  'ENCRYPTION_MASTER_KEY',
  'SCW_KEY_MANAGER_KEY_ID',
  'SCW_KEY_MANAGER_REGION',
  'SCW_API_KEY',
  'AWS_KMS_KEY_ID',
] as const;

const HEX_KEY = Buffer.alloc(32, 3).toString('hex');
const DEK = Buffer.alloc(32, 7);
const OTHER_DEK = Buffer.alloc(32, 9);

const originalFetch = globalThis.fetch;
let saved: Record<string, string | undefined>;

/** Answer each Key Manager action with whatever the case under test needs. */
function scalewayFetch(
  perAction: Partial<Record<string, () => Response | Promise<Response>>>,
) {
  return vi.fn(async (url: string | URL) => {
    const action = String(url).split('/').pop() as string;
    const handler = perAction[action];
    if (!handler) {
      throw new Error(`unexpected Key Manager action: ${action}`);
    }
    return handler();
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function useScaleway() {
  process.env.SCW_KEY_MANAGER_KEY_ID = 'key-1';
  process.env.SCW_API_KEY = 'scw-secret';
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
  resetKeyProviderForTests();
  resetEncryptionProbeForTests();
  send.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
  globalThis.fetch = originalFetch;
  resetKeyProviderForTests();
  resetEncryptionProbeForTests();
});

describe('probeEncryptionProvider', () => {
  it('skips when no provider is configured — that is not its question', async () => {
    const result = await probeEncryptionProvider();

    expect(result).toEqual({ status: 'skipped', provider: null });
    expect(encryptionProviderIsUnusable()).toBe(false);
  });

  it('passes on a provider that wraps and unwraps', async () => {
    process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;

    const result = await probeEncryptionProvider();

    expect(result.status).toBe('ok');
    expect(result.provider).toBe('local');
    expect(encryptionProviderIsUnusable()).toBe(false);
  });

  it('exercises decrypt as well as generate — they are separate permissions', async () => {
    useScaleway();
    const fetchMock = scalewayFetch({
      'generate-data-key': () =>
        json({ plaintext: DEK.toString('base64'), ciphertext: 'wrapped' }),
      decrypt: () => json({ plaintext: DEK.toString('base64') }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await probeEncryptionProvider();

    expect(result.status).toBe('ok');
    expect(result.provider).toBe('scaleway');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a 403 on the key as misconfigured, not as a blip', async () => {
    useScaleway();
    globalThis.fetch = scalewayFetch({
      'generate-data-key': () =>
        json(
          { type: 'permissions_denied', message: 'insufficient permissions' },
          403,
        ),
    }) as unknown as typeof fetch;

    const result = await probeEncryptionProvider();

    expect(result.status).toBe('misconfigured');
    expect(result.detail).toContain('403');
    expect(encryptionProviderIsUnusable()).toBe(true);
  });

  it('reports a key the credentials may wrap but not unwrap', async () => {
    useScaleway();
    globalThis.fetch = scalewayFetch({
      'generate-data-key': () =>
        json({ plaintext: DEK.toString('base64'), ciphertext: 'wrapped' }),
      decrypt: () => json({ message: 'insufficient permissions' }, 403),
    }) as unknown as typeof fetch;

    const result = await probeEncryptionProvider();

    expect(result.status).toBe('misconfigured');
    expect(result.detail).toContain('decrypt');
  });

  it('reports a round trip that comes back as different bytes', async () => {
    useScaleway();
    globalThis.fetch = scalewayFetch({
      'generate-data-key': () =>
        json({ plaintext: DEK.toString('base64'), ciphertext: 'wrapped' }),
      decrypt: () => json({ plaintext: OTHER_DEK.toString('base64') }),
    }) as unknown as typeof fetch;

    const result = await probeEncryptionProvider();

    expect(result.status).toBe('misconfigured');
    expect(result.detail).toMatch(/different bytes/);
  });

  it('reports a malformed response as misconfigured — a retry will not fix it', async () => {
    useScaleway();
    globalThis.fetch = scalewayFetch({
      'generate-data-key': () => json({ ciphertext: 'wrapped' }),
    }) as unknown as typeof fetch;

    expect((await probeEncryptionProvider()).status).toBe('misconfigured');
  });

  it.each([
    ['429, which says later rather than never', 429],
    ['408', 408],
    ['a 500 from the service', 500],
    ['a 503 from the service', 503],
  ])('treats %s as transient', async (_label, status) => {
    useScaleway();
    globalThis.fetch = scalewayFetch({
      'generate-data-key': () => json({ message: 'slow down' }, status),
    }) as unknown as typeof fetch;

    const result = await probeEncryptionProvider();

    expect(result.status).toBe('unavailable');
    expect(encryptionProviderIsUnusable()).toBe(false);
  });

  it('treats a socket that never opened as transient', async () => {
    useScaleway();
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;

    expect((await probeEncryptionProvider()).status).toBe('unavailable');
  });

  it('treats an unrecognised failure as transient rather than blocking on it', async () => {
    useScaleway();
    globalThis.fetch = vi.fn(async () => {
      throw new Error('something nobody anticipated');
    }) as unknown as typeof fetch;

    expect((await probeEncryptionProvider()).status).toBe('unavailable');
  });

  it('reads AWS refusals that carry no HTTP status', async () => {
    process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:eu-central-1:1:key/abc';
    send.mockRejectedValue(
      Object.assign(new Error('not authorized'), {
        name: 'AccessDeniedException',
      }),
    );

    const result = await probeEncryptionProvider();

    expect(result.status).toBe('misconfigured');
    expect(result.provider).toBe('kms');
  });

  /**
   * KMS answers a throttle with **HTTP 400** — the same status as a refusal —
   * so classifying on the status alone turned a rate limit at boot into
   * "misconfigured" and blocked a working deployment until someone restarted
   * it.
   */
  it.each([
    [
      'the Smithy retryable trait',
      Object.assign(new Error('slow down'), {
        name: 'SomeFutureThrottle',
        $retryable: { throttling: true },
        $metadata: { httpStatusCode: 400 },
      }),
    ],
    [
      'ThrottlingException, which arrives as a 400',
      Object.assign(new Error('rate exceeded'), {
        name: 'ThrottlingException',
        $metadata: { httpStatusCode: 400 },
      }),
    ],
    [
      'LimitExceededException, which is a request rate on KMS',
      Object.assign(new Error('limit exceeded'), {
        name: 'LimitExceededException',
        $metadata: { httpStatusCode: 400 },
      }),
    ],
  ])('treats AWS throttling as transient — %s', async (_label, error) => {
    process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:eu-central-1:1:key/abc';
    send.mockRejectedValue(error);

    const result = await probeEncryptionProvider();

    expect(result.status).toBe('unavailable');
    expect(encryptionProviderIsUnusable()).toBe(false);
  });

  it('still blocks on a 400 that is a refusal rather than a throttle', async () => {
    process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:eu-central-1:1:key/abc';
    send.mockRejectedValue(
      Object.assign(new Error('invalid key id'), {
        name: 'NotFoundException',
        $metadata: { httpStatusCode: 400 },
      }),
    );

    expect((await probeEncryptionProvider()).status).toBe('misconfigured');
  });

  it('reads an AWS 5xx as transient', async () => {
    process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:eu-central-1:1:key/abc';
    send.mockRejectedValue(
      Object.assign(new Error('internal failure'), {
        name: 'KMSInternalException',
        $metadata: { httpStatusCode: 500 },
      }),
    );

    expect((await probeEncryptionProvider()).status).toBe('unavailable');
  });

  it('caches its verdict for the synchronous startup check', async () => {
    expect(getEncryptionProbeResult()).toBeNull();

    process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;
    await probeEncryptionProvider();

    expect(getEncryptionProbeResult()?.status).toBe('ok');
  });

  /**
   * The label repeats the branch order in `getKeyProvider()`. This is what
   * stops the two drifting — the same pairing the key-provider module holds
   * between its factory and its predicate.
   */
  it.each([
    ['local', { ENCRYPTION_MASTER_KEY: HEX_KEY }, LocalKeyProvider],
    [
      'scaleway',
      { SCW_KEY_MANAGER_KEY_ID: 'key-1', SCW_API_KEY: 'scw-secret' },
      ScalewayKeyProvider,
    ],
    [
      'kms',
      { AWS_KMS_KEY_ID: 'arn:aws:kms:eu-central-1:1:key/abc' },
      KmsKeyProvider,
    ],
    [
      'scaleway',
      {
        ENCRYPTION_PROVIDER: 'scaleway',
        SCW_KEY_MANAGER_KEY_ID: 'key-1',
        SCW_API_KEY: 'scw-secret',
        AWS_KMS_KEY_ID: 'arn:aws:kms:eu-central-1:1:key/abc',
      },
      ScalewayKeyProvider,
    ],
    [
      'kms',
      {
        ENCRYPTION_PROVIDER: 'kms',
        AWS_KMS_KEY_ID: 'arn:aws:kms:eu-central-1:1:key/abc',
        ENCRYPTION_MASTER_KEY: HEX_KEY,
      },
      KmsKeyProvider,
    ],
  ])(
    'labels the provider %s exactly as getKeyProvider() picks it',
    async (label, env, expectedClass) => {
      Object.assign(process.env, env);
      // Fail the call: this asserts the label, and the outcome is covered above.
      globalThis.fetch = vi.fn(async () => {
        throw new Error('nope');
      }) as unknown as typeof fetch;
      send.mockRejectedValue(new Error('nope'));

      const result = await probeEncryptionProvider();

      expect(result.provider).toBe(label);
      expect(getKeyProvider()).toBeInstanceOf(expectedClass);
    },
  );
});

describe('getEncryptionStartupStatus, after a probe', () => {
  const deployed = {
    NODE_ENV: 'production',
    TARGET_ENV: 'production',
  } as unknown as NodeJS.ProcessEnv;

  it('blocks on a provider proved unusable', async () => {
    useScaleway();
    globalThis.fetch = scalewayFetch({
      'generate-data-key': () => json({ message: 'denied' }, 403),
    }) as unknown as typeof fetch;
    await probeEncryptionProvider();

    expect(getEncryptionStartupStatus(deployed)).toBe('blocked');
  });

  /**
   * ALLOW_UNENCRYPTED waives the *requirement*. It does not make a broken key
   * work, and `isEncryptionEnabled()` stays true either way — so every write
   * would still call the key and still throw. Answering 'bypassed' here would
   * promise a plaintext fallback that does not exist.
   */
  it('is not waived by ALLOW_UNENCRYPTED', async () => {
    useScaleway();
    globalThis.fetch = scalewayFetch({
      'generate-data-key': () => json({ message: 'denied' }, 403),
    }) as unknown as typeof fetch;
    await probeEncryptionProvider();

    expect(
      getEncryptionStartupStatus({ ...deployed, ALLOW_UNENCRYPTED: '1' }),
    ).toBe('blocked');
  });

  it('stays ok when the probe only failed to reach the service', async () => {
    useScaleway();
    globalThis.fetch = scalewayFetch({
      'generate-data-key': () => json({ message: 'later' }, 503),
    }) as unknown as typeof fetch;
    await probeEncryptionProvider();

    expect(getEncryptionStartupStatus(deployed)).toBe('ok');
  });

  it('is unchanged in a process that never probes', () => {
    process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;

    expect(getEncryptionStartupStatus(deployed)).toBe('ok');
  });
});
