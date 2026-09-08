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

import {
  getKeyProvider,
  isEncryptionConfigured,
  resetKeyProviderForTests,
} from '../key-provider';
import { KmsKeyProvider } from '../key-provider/kms-provider';
import { LocalKeyProvider } from '../key-provider/local-provider';
import { ScalewayKeyProvider } from '../key-provider/scaleway-provider';

const ENV_KEYS = [
  'ENCRYPTION_PROVIDER',
  'ENCRYPTION_MASTER_KEY',
  'SCW_KEY_MANAGER_KEY_ID',
  'SCW_API_KEY',
  'AWS_KMS_KEY_ID',
] as const;

const HEX_KEY = Buffer.alloc(32, 3).toString('hex');

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
  resetKeyProviderForTests();
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
  resetKeyProviderForTests();
});

/** Each provider, with the environment that selects it explicitly. */
const PROVIDERS = [
  {
    name: 'scaleway',
    env: {
      ENCRYPTION_PROVIDER: 'scaleway',
      SCW_KEY_MANAGER_KEY_ID: 'key-1',
      SCW_API_KEY: 'scw-1',
    },
    type: ScalewayKeyProvider,
  },
  {
    name: 'kms',
    env: { ENCRYPTION_PROVIDER: 'kms', AWS_KMS_KEY_ID: 'arn:key' },
    type: KmsKeyProvider,
  },
  {
    name: 'local',
    env: { ENCRYPTION_PROVIDER: 'local', ENCRYPTION_MASTER_KEY: HEX_KEY },
    type: LocalKeyProvider,
  },
] as const;

describe('provider selection', () => {
  it.each(PROVIDERS)('honours ENCRYPTION_PROVIDER=$name', ({ env, type }) => {
    Object.assign(process.env, env);

    expect(getKeyProvider()).toBeInstanceOf(type);
  });

  it('auto-detects Scaleway ahead of KMS and local', () => {
    process.env.SCW_KEY_MANAGER_KEY_ID = 'key-1';
    process.env.SCW_API_KEY = 'scw-1';
    process.env.AWS_KMS_KEY_ID = 'arn:key';
    process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;

    expect(getKeyProvider()).toBeInstanceOf(ScalewayKeyProvider);
  });

  it('auto-detects KMS ahead of local', () => {
    process.env.AWS_KMS_KEY_ID = 'arn:key';
    process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;

    expect(getKeyProvider()).toBeInstanceOf(KmsKeyProvider);
  });

  it('ignores a Scaleway key id with no API key', () => {
    // Half-configured Scaleway used to reach the provider and fail inside the
    // HTTP client instead of falling through to the key that is present.
    process.env.SCW_KEY_MANAGER_KEY_ID = 'key-1';
    process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;

    expect(getKeyProvider()).toBeInstanceOf(LocalKeyProvider);
  });

  it('caches the instance', () => {
    process.env.ENCRYPTION_PROVIDER = 'local';
    process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;

    expect(getKeyProvider()).toBe(getKeyProvider());
  });

  it('names the supported values for an unknown provider', () => {
    process.env.ENCRYPTION_PROVIDER = 'vault';

    expect(() => getKeyProvider()).toThrow(/Unknown ENCRYPTION_PROVIDER/);
    expect(isEncryptionConfigured()).toBe(false);
  });

  it('refuses when nothing is configured', () => {
    expect(() => getKeyProvider()).toThrow(/No encryption provider configured/);
    expect(isEncryptionConfigured()).toBe(false);
  });
});

describe('the predicate agrees with the factory', () => {
  /**
   * The invariant the whole package is built around. Callers check
   * `isEncryptionConfigured()` and then call `getKeyProvider()`, and
   * `apply-dual-content-mode.ts` wraps the second in a `try` whose `catch`
   * silently continues without encryption. So a disagreement is not an error
   * anyone sees — it is an organization's encrypted originals quietly not
   * being written. `apps/worker` disagreed for `kms` for months.
   */
  it.each(PROVIDERS)('configured means constructible for $name', ({ env }) => {
    Object.assign(process.env, env);

    expect(isEncryptionConfigured()).toBe(true);
    expect(() => getKeyProvider()).not.toThrow();
  });

  it('treats a malformed master key as unconfigured, not as configured', () => {
    // The gap the matrix missed: it varied *absent* credentials and never a
    // *present but unusable* one. LocalKeyProvider parses in its constructor,
    // so presence alone made the predicate answer yes while the factory threw
    // — the silent-downgrade path this file exists to forbid.
    process.env.ENCRYPTION_PROVIDER = 'local';
    process.env.ENCRYPTION_MASTER_KEY = 'x';

    expect(isEncryptionConfigured()).toBe(false);
    expect(() => getKeyProvider()).toThrow(/must be 32 bytes/);
  });

  it('does not auto-detect a malformed master key either', () => {
    process.env.ENCRYPTION_MASTER_KEY = 'x';

    expect(isEncryptionConfigured()).toBe(false);
    expect(() => getKeyProvider()).toThrow(/No encryption provider configured/);
  });

  it.each(PROVIDERS)(
    'and unconfigured means it throws for $name',
    ({ env }) => {
      process.env.ENCRYPTION_PROVIDER = env.ENCRYPTION_PROVIDER;

      expect(isEncryptionConfigured()).toBe(false);
      expect(() => getKeyProvider()).toThrow();
    },
  );
});

describe('LocalKeyProvider', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_PROVIDER = 'local';
    process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;
  });

  it('wraps and unwraps a DEK', async () => {
    const provider = getKeyProvider();
    const { encryptedDek, plaintextDek } = await provider.generateDataKey();

    expect(plaintextDek).toHaveLength(32);
    expect(
      (await provider.decryptDataKey(encryptedDek)).equals(plaintextDek),
    ).toBe(true);
  });

  it('rejects a wrapped key that is too short', async () => {
    await expect(
      getKeyProvider().decryptDataKey(Buffer.alloc(8).toString('base64')),
    ).rejects.toThrow(/too short/);
  });

  it('reads a base64 master key as well as a hex one', async () => {
    process.env.ENCRYPTION_MASTER_KEY = Buffer.alloc(32, 3).toString('base64');
    resetKeyProviderForTests();

    // Same 32 bytes as HEX_KEY, so a DEK wrapped under one unwraps under the
    // other — which is what makes accepting both encodings safe.
    const provider = getKeyProvider();
    const { encryptedDek, plaintextDek } = await provider.generateDataKey();

    process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;
    resetKeyProviderForTests();

    expect(
      (await getKeyProvider().decryptDataKey(encryptedDek)).equals(
        plaintextDek,
      ),
    ).toBe(true);
  });
});

describe('KmsKeyProvider', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_PROVIDER = 'kms';
    process.env.AWS_KMS_KEY_ID = 'arn:key';
  });

  it('returns the generated pair', async () => {
    const dek = Buffer.alloc(32, 9);
    send.mockResolvedValue({
      Plaintext: dek,
      CiphertextBlob: Buffer.from('wrapped'),
    });

    const result = await getKeyProvider().generateDataKey();

    expect(result.plaintextDek.equals(dek)).toBe(true);
    expect(result.encryptedDek).toBe(Buffer.from('wrapped').toString('base64'));
  });

  it('throws on an incomplete generate response', async () => {
    send.mockResolvedValue({ Plaintext: Buffer.alloc(32) });

    await expect(getKeyProvider().generateDataKey()).rejects.toThrow(
      /incomplete response/,
    );
  });

  it('throws when decrypt returns no plaintext', async () => {
    send.mockResolvedValue({});

    await expect(getKeyProvider().decryptDataKey('x')).rejects.toThrow(
      /empty plaintext/,
    );
  });

  it('rejects a decrypted key that is not 32 bytes', async () => {
    // The Scaleway client checked this and the AWS one did not. A short key
    // reaches dekCache and then fails inside createDecipheriv as an opaque
    // "Invalid key length", far from the cause.
    send.mockResolvedValue({ Plaintext: Buffer.alloc(16, 1) });

    await expect(getKeyProvider().decryptDataKey('x')).rejects.toThrow(
      /expected 32 bytes, got 16/,
    );
  });

  it('rejects a generated key that is not 32 bytes', async () => {
    send.mockResolvedValue({
      Plaintext: Buffer.alloc(8, 1),
      CiphertextBlob: Buffer.from('wrapped'),
    });

    await expect(getKeyProvider().generateDataKey()).rejects.toThrow(
      /expected 32 bytes, got 8/,
    );
  });

  it('names the configured key when decrypting', async () => {
    // Without KeyId, a blob wrapped under a different key this principal may
    // use would decrypt happily, and the configured key would stop being the
    // boundary it is meant to be.
    send.mockResolvedValue({ Plaintext: Buffer.alloc(32, 1) });

    await getKeyProvider().decryptDataKey('x');

    const command = send.mock.calls[0][0] as { input: { KeyId?: string } };
    expect(command.input.KeyId).toBe('arn:key');
  });
});
