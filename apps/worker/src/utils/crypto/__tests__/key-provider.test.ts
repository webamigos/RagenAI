/* eslint-disable no-var */
var mockKmsSend: jest.Mock;
/* eslint-enable no-var */

jest.mock('@aws-sdk/client-kms', () => {
  mockKmsSend = jest.fn();
  return {
    KMSClient: jest.fn().mockImplementation(() => ({ send: mockKmsSend })),
    DecryptCommand: jest
      .fn()
      .mockImplementation((input: unknown) => ({ input })),
  };
});

import { randomBytes, createCipheriv } from 'node:crypto';
import {
  getKeyProvider,
  isEncryptionConfigured,
  resetKeyProviderForTests,
} from '../key-provider';

// Helper: encrypt a raw DEK buffer using AES-256-GCM with a master key,
// returning base64(IV[12] + ciphertext + authTag[16]) — the same format
// LocalKeyProvider.decryptDataKey expects.
function encryptDek(dek: Buffer, masterKey: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, iv, {
    authTagLength: 16,
  });
  const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString('base64');
}

// Save and restore all env vars touched across tests.
const ENV_KEYS = [
  'ENCRYPTION_MASTER_KEY',
  'ENCRYPTION_PROVIDER',
  'SCW_KEY_MANAGER_KEY_ID',
  'SCW_API_KEY',
  'AWS_KMS_KEY_ID',
] as const;

function saveEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
}

describe('LocalKeyProvider (via getKeyProvider)', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    // Clear all relevant env vars before each test
    for (const k of ENV_KEYS) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    resetKeyProviderForTests();
    restoreEnv(savedEnv);
  });

  it('decryptDataKey round-trip: decrypts a DEK encrypted with the same master key', async () => {
    const masterKey = randomBytes(32);
    process.env.ENCRYPTION_MASTER_KEY = masterKey.toString('base64');

    const dek = randomBytes(32);
    const encryptedDek = encryptDek(dek, masterKey);

    const provider = getKeyProvider();
    const decrypted = await provider.decryptDataKey(encryptedDek);

    expect(decrypted.toString('hex')).toBe(dek.toString('hex'));
  });

  it('accepts the 64-character hex key .env.example documents', async () => {
    // The bug this covers: hex was decoded as base64 (a 64-char hex string is
    // valid base64 input and yields 48 bytes), so the documented key failed as
    // "wrong length" and every dual-content ingest fell back to masked-only.
    const masterKey = randomBytes(32);
    process.env.ENCRYPTION_MASTER_KEY = masterKey.toString('hex');

    const dek = randomBytes(32);
    const encryptedDek = encryptDek(dek, masterKey);

    const decrypted = await getKeyProvider().decryptDataKey(encryptedDek);

    expect(decrypted.toString('hex')).toBe(dek.toString('hex'));
  });

  it('unwraps a DEK wrapped by apps/web under the same hex key', async () => {
    // The interop that matters: apps/web wraps with the hex-decoded key and
    // the worker unwraps. Same key material, both encodings of the same
    // 32 bytes, so the two apps must agree byte for byte.
    const masterKey = randomBytes(32);
    const asWebReadsIt = Buffer.from(masterKey.toString('hex'), 'hex');
    expect(asWebReadsIt.equals(masterKey)).toBe(true);

    process.env.ENCRYPTION_MASTER_KEY = masterKey.toString('hex');

    const dek = randomBytes(32);
    const wrappedByWeb = encryptDek(dek, asWebReadsIt);

    const decrypted = await getKeyProvider().decryptDataKey(wrappedByWeb);

    expect(decrypted.equals(dek)).toBe(true);
  });

  it('still accepts a base64 key, which existing deployments use', async () => {
    const masterKey = randomBytes(32);
    process.env.ENCRYPTION_MASTER_KEY = masterKey.toString('base64');

    const dek = randomBytes(32);
    const decrypted = await getKeyProvider().decryptDataKey(
      encryptDek(dek, masterKey),
    );

    expect(decrypted.equals(dek)).toBe(true);
  });

  it('rejects a key that is neither, naming both forms', async () => {
    process.env.ENCRYPTION_MASTER_KEY = 'far-too-short';

    expect(() => getKeyProvider()).toThrow(/hex/);
    expect(() => getKeyProvider()).toThrow(/base64/);
  });

  it('decryptDataKey throws on truncated payload', async () => {
    const masterKey = randomBytes(32);
    process.env.ENCRYPTION_MASTER_KEY = masterKey.toString('base64');

    // 10 bytes is below the minimum 28 (IV[12] + authTag[16])
    const tooShort = randomBytes(10).toString('base64');

    const provider = getKeyProvider();
    await expect(provider.decryptDataKey(tooShort)).rejects.toThrow();
  });

  it('decryptDataKey throws when decrypted with a different master key', async () => {
    const masterKeyA = randomBytes(32);
    const masterKeyB = randomBytes(32);
    process.env.ENCRYPTION_MASTER_KEY = masterKeyB.toString('base64');

    const dek = randomBytes(32);
    const encryptedDek = encryptDek(dek, masterKeyA);

    const provider = getKeyProvider();
    await expect(provider.decryptDataKey(encryptedDek)).rejects.toThrow();
  });
});

describe('getKeyProvider — configuration errors', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    for (const k of ENV_KEYS) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    resetKeyProviderForTests();
    restoreEnv(savedEnv);
  });

  it('throws when neither Scaleway nor local encryption is configured', () => {
    expect(() => getKeyProvider()).toThrow(/No encryption provider configured/);
  });

  it('singleton: calling getKeyProvider twice returns the same instance', () => {
    const masterKey = randomBytes(32);
    process.env.ENCRYPTION_MASTER_KEY = masterKey.toString('base64');

    const first = getKeyProvider();
    const second = getKeyProvider();
    expect(first).toBe(second);
  });
});

describe('isEncryptionConfigured', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    for (const k of ENV_KEYS) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  it('returns true when ENCRYPTION_MASTER_KEY is set', () => {
    process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString('base64');
    expect(isEncryptionConfigured()).toBe(true);
  });

  it('returns false when nothing is configured', () => {
    expect(isEncryptionConfigured()).toBe(false);
  });

  it('returns true when SCW_KEY_MANAGER_KEY_ID and SCW_API_KEY are both set', () => {
    process.env.SCW_KEY_MANAGER_KEY_ID = 'test-key-id';
    process.env.SCW_API_KEY = 'test-api-key';
    expect(isEncryptionConfigured()).toBe(true);
  });

  it('returns true when ENCRYPTION_PROVIDER=scaleway and Scaleway env vars are set', () => {
    process.env.ENCRYPTION_PROVIDER = 'scaleway';
    process.env.SCW_KEY_MANAGER_KEY_ID = 'test-key-id';
    process.env.SCW_API_KEY = 'test-api-key';
    expect(isEncryptionConfigured()).toBe(true);
  });

  it('returns false when ENCRYPTION_PROVIDER=scaleway but Scaleway env vars are missing', () => {
    process.env.ENCRYPTION_PROVIDER = 'scaleway';
    expect(isEncryptionConfigured()).toBe(false);
  });

  it('returns false when ENCRYPTION_PROVIDER is set to an unknown value', () => {
    process.env.ENCRYPTION_PROVIDER = 'aws';
    process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.SCW_KEY_MANAGER_KEY_ID = 'test-key-id';
    process.env.SCW_API_KEY = 'test-api-key';
    expect(isEncryptionConfigured()).toBe(false);
  });
});

describe('ScalewayKeyProvider (via getKeyProvider)', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    for (const k of ENV_KEYS) {
      delete process.env[k];
    }
    process.env.ENCRYPTION_PROVIDER = 'scaleway';
    process.env.SCW_KEY_MANAGER_KEY_ID = 'test-key-id';
    process.env.SCW_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    resetKeyProviderForTests();
    restoreEnv(savedEnv);
    jest.restoreAllMocks();
  });

  it('happy path: calls Scaleway decrypt and returns the decrypted buffer', async () => {
    const plaintextBytes = randomBytes(32);
    const plaintextBase64 = plaintextBytes.toString('base64');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plaintext: plaintextBase64 }),
      text: async () => '',
    } as unknown as Response);

    const provider = getKeyProvider();
    const result = await provider.decryptDataKey('some-encrypted-dek');

    expect(result.toString('hex')).toBe(plaintextBytes.toString('hex'));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws when Scaleway returns a non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    } as unknown as Response);

    const provider = getKeyProvider();
    await expect(provider.decryptDataKey('some-encrypted-dek')).rejects.toThrow(
      /403/,
    );
  });

  it('throws when Scaleway response is missing plaintext', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => '',
    } as unknown as Response);

    const provider = getKeyProvider();
    await expect(provider.decryptDataKey('some-encrypted-dek')).rejects.toThrow(
      /empty plaintext/,
    );
  });
});

describe('AWS KMS provider', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    for (const k of ENV_KEYS) {
      delete process.env[k];
    }
    resetKeyProviderForTests();
    mockKmsSend.mockReset();
  });

  afterEach(() => {
    resetKeyProviderForTests();
    restoreEnv(savedEnv);
  });

  it('reports encryption as configured for ENCRYPTION_PROVIDER=kms', () => {
    // The bug. This returned false, and because callers treat it as a
    // predicate rather than a failure, apply-dual-content-mode logged one
    // line and silently reduced dual-content PII to destructive mode.
    process.env.ENCRYPTION_PROVIDER = 'kms';
    process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:eu-west-1:1:key/abc';

    expect(isEncryptionConfigured()).toBe(true);
  });

  it('decrypts a DEK through KMS', async () => {
    process.env.ENCRYPTION_PROVIDER = 'kms';
    process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:eu-west-1:1:key/abc';
    const dek = randomBytes(32);
    mockKmsSend.mockResolvedValue({ Plaintext: dek });

    const decrypted = await getKeyProvider().decryptDataKey(
      Buffer.from('wrapped').toString('base64'),
    );

    expect(decrypted.equals(dek)).toBe(true);
    expect(mockKmsSend).toHaveBeenCalledTimes(1);
  });

  it('throws when KMS returns no plaintext', async () => {
    process.env.ENCRYPTION_PROVIDER = 'kms';
    process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:eu-west-1:1:key/abc';
    mockKmsSend.mockResolvedValue({});

    await expect(
      getKeyProvider().decryptDataKey(Buffer.from('x').toString('base64')),
    ).rejects.toThrow(/empty plaintext/);
  });

  it('is auto-detected from AWS_KMS_KEY_ID alone', () => {
    process.env.AWS_KMS_KEY_ID = 'arn:aws:kms:eu-west-1:1:key/abc';

    expect(isEncryptionConfigured()).toBe(true);
    expect(() => getKeyProvider()).not.toThrow();
  });

  it('refuses ENCRYPTION_PROVIDER=kms with no key id', () => {
    process.env.ENCRYPTION_PROVIDER = 'kms';

    expect(isEncryptionConfigured()).toBe(false);
    expect(() => getKeyProvider()).toThrow(/AWS_KMS_KEY_ID/);
  });
});

describe('the two entry points agree', () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    for (const k of ENV_KEYS) {
      delete process.env[k];
    }
    resetKeyProviderForTests();
  });

  afterEach(() => {
    resetKeyProviderForTests();
    restoreEnv(savedEnv);
  });

  /**
   * The invariant that was broken, stated once rather than per provider:
   * `isEncryptionConfigured()` is the gate every caller checks, and
   * `getKeyProvider()` is what they call next. When the first says yes and
   * the second throws — or the first says no for a provider the second
   * supports — the result is a silent fallback, not an error. `kms` was the
   * second case for as long as this file lacked the branch.
   */
  const CASES: { name: string; env: Record<string, string> }[] = [
    {
      name: 'scaleway',
      env: {
        ENCRYPTION_PROVIDER: 'scaleway',
        SCW_KEY_MANAGER_KEY_ID: 'key-1',
        SCW_API_KEY: 'scw-1',
      },
    },
    {
      name: 'kms',
      env: { ENCRYPTION_PROVIDER: 'kms', AWS_KMS_KEY_ID: 'arn:key' },
    },
    {
      name: 'local',
      env: {
        ENCRYPTION_PROVIDER: 'local',
        ENCRYPTION_MASTER_KEY: randomBytes(32).toString('hex'),
      },
    },
  ];

  it.each(CASES)('configured means constructible for $name', ({ env }) => {
    Object.assign(process.env, env);

    expect(isEncryptionConfigured()).toBe(true);
    expect(() => getKeyProvider()).not.toThrow();
  });

  it.each(CASES)('and unconfigured means it throws for $name', ({ env }) => {
    // Same provider, credentials withheld.
    process.env.ENCRYPTION_PROVIDER = env.ENCRYPTION_PROVIDER;

    expect(isEncryptionConfigured()).toBe(false);
    expect(() => getKeyProvider()).toThrow();
  });
});
