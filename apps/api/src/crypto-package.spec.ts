import {
  decryptContent,
  encryptContent,
  getKeyProvider,
  isEncryptionConfigured,
  resetKeyProviderForTests,
} from '@ragenai/crypto';

/**
 * That `@ragenai/crypto` works *from inside apps/api*, which a package test
 * cannot show.
 *
 * This app compiles with `nodenext` resolution and runs the output on plain
 * node, so it is the strictest consumer of the three: a package that resolves
 * under Next's bundler and under the worker's CJS Jest transform can still
 * fail here. ADR-21 is explicit that apps/api is a separate implementation
 * with its own tests, and Phase C of
 * docs/specs/2026-09-08-one-encryption-package.md deleted the copy that used
 * to carry them.
 *
 * The fixed vector is the second half. It is the same payload the package
 * pins, encrypted before any of this moved, so this file also proves apps/api
 * still reads what the rest of the fleet wrote — the property that makes a
 * partial rollout safe.
 */
const DEK = Buffer.from(
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
  'hex',
);
const VECTOR =
  'oKGio6SlpqeoqaqrtHkbSCvrZ9EUAOu8dx/guB/eNHHmlzRdvOymEl/PGiG8GTPfzEoyUzj5THvQALzBbO3cYXZHI5zGTg==';
const PLAINTEXT = 'Ragen envelope format v1 — do not change';

const HEX_MASTER_KEY = Buffer.alloc(32, 11).toString('hex');
const SAVED = { ...process.env };

describe('@ragenai/crypto, resolved from apps/api', () => {
  beforeEach(() => {
    process.env.ENCRYPTION_PROVIDER = 'local';
    process.env.ENCRYPTION_MASTER_KEY = HEX_MASTER_KEY;
    delete process.env.SCW_KEY_MANAGER_KEY_ID;
    delete process.env.AWS_KMS_KEY_ID;
    resetKeyProviderForTests();
  });

  afterEach(() => {
    process.env = { ...SAVED };
    resetKeyProviderForTests();
  });

  it('decrypts a payload written before the extraction', () => {
    expect(decryptContent(VECTOR, DEK)).toBe(PLAINTEXT);
  });

  it('round-trips through a wrapped DEK', async () => {
    const provider = getKeyProvider();
    const { encryptedDek, plaintextDek } = await provider.generateDataKey();

    const ciphertext = encryptContent('a message', plaintextDek);
    const unwrapped = await provider.decryptDataKey(encryptedDek);

    expect(decryptContent(ciphertext, unwrapped)).toBe('a message');
  });

  it('agrees with itself about whether encryption is configured', () => {
    expect(isEncryptionConfigured()).toBe(true);

    delete process.env.ENCRYPTION_MASTER_KEY;
    resetKeyProviderForTests();

    expect(isEncryptionConfigured()).toBe(false);
    expect(() => getKeyProvider()).toThrow();
  });
});
