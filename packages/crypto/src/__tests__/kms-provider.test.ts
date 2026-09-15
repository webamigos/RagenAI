import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
const constructedWith = vi.fn();

vi.mock('@aws-sdk/client-kms', () => ({
  KMSClient: class {
    send = send;
    constructor(config: unknown) {
      constructedWith(config);
    }
  },
  GenerateDataKeyCommand: class {
    constructor(public input: unknown) {}
  },
  DecryptCommand: class {
    constructor(public input: unknown) {}
  },
}));

import { KmsKeyProvider } from '../key-provider/kms-provider';

const ENV_KEYS = ['AWS_KMS_KEY_ID', 'AWS_ENDPOINT_URL', 'AWS_DEFAULT_REGION'];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:eu-central-1:1:key/abc';
  send.mockReset();
  constructedWith.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
});

describe('KmsKeyProvider', () => {
  it('requires a key id', () => {
    delete process.env.AWS_KMS_KEY_ID;

    expect(() => new KmsKeyProvider()).toThrow(/AWS_KMS_KEY_ID/);
  });

  /**
   * `probeEncryptionProvider()` calls this on the boot path, and the SDK ships
   * `DEFAULT_REQUEST_TIMEOUT = 0` — no timeout at all. Without a finite one, a
   * KMS endpoint that accepts a socket and never answers does not fail the
   * deploy, it leaves the process starting forever with nothing logged.
   */
  it('bounds the boot path with finite timeouts', () => {
    new KmsKeyProvider();

    const config = constructedWith.mock.calls[0]?.[0] as {
      requestHandler?: {
        connectionTimeout?: number;
        requestTimeout?: number;
        throwOnRequestTimeout?: boolean;
      };
    };

    expect(config.requestHandler?.connectionTimeout).toBeGreaterThan(0);
    expect(config.requestHandler?.requestTimeout).toBeGreaterThan(0);
  });

  /**
   * Not redundant with the timeouts above: the SDK's own types say
   * `requestTimeout` only emits a warning unless this is set, and a warning
   * does not settle an awaited promise.
   */
  it('throws on the timeout rather than warning about it', () => {
    new KmsKeyProvider();

    const config = constructedWith.mock.calls[0]?.[0] as {
      requestHandler?: { throwOnRequestTimeout?: boolean };
    };

    expect(config.requestHandler?.throwOnRequestTimeout).toBe(true);
  });
});
