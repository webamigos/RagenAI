import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { LocalKeyProvider } from '../local-provider';

describe('LocalKeyProvider', () => {
  const masterKey = randomBytes(32).toString('hex');
  let provider: LocalKeyProvider;

  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', masterKey);
    provider = new LocalKeyProvider();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should throw when ENCRYPTION_MASTER_KEY is not set', () => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', '');
    expect(() => new LocalKeyProvider()).toThrow(
      'ENCRYPTION_MASTER_KEY is not configured',
    );
  });

  it('should throw when ENCRYPTION_MASTER_KEY is wrong length', () => {
    vi.stubEnv('ENCRYPTION_MASTER_KEY', 'tooshort');
    expect(() => new LocalKeyProvider()).toThrow('64-character hex string');
  });

  describe('generateDataKey', () => {
    it('should return a 32-byte plaintext DEK', async () => {
      const { plaintextDek } = await provider.generateDataKey();
      expect(Buffer.isBuffer(plaintextDek)).toBe(true);
      expect(plaintextDek.length).toBe(32);
    });

    it('should return a base64-encoded encrypted DEK', async () => {
      const { encryptedDek } = await provider.generateDataKey();
      expect(typeof encryptedDek).toBe('string');
      // Should be valid base64
      expect(() => Buffer.from(encryptedDek, 'base64')).not.toThrow();
    });

    it('should generate different DEKs each call', async () => {
      const key1 = await provider.generateDataKey();
      const key2 = await provider.generateDataKey();
      expect(key1.plaintextDek).not.toEqual(key2.plaintextDek);
      expect(key1.encryptedDek).not.toBe(key2.encryptedDek);
    });
  });

  describe('decryptDataKey', () => {
    it('should round-trip: generate then decrypt', async () => {
      const { encryptedDek, plaintextDek } = await provider.generateDataKey();
      const decrypted = await provider.decryptDataKey(encryptedDek);
      expect(decrypted).toEqual(plaintextDek);
    });

    it('should fail with wrong master key', async () => {
      const { encryptedDek } = await provider.generateDataKey();

      vi.stubEnv('ENCRYPTION_MASTER_KEY', randomBytes(32).toString('hex'));
      const otherProvider = new LocalKeyProvider();

      await expect(
        otherProvider.decryptDataKey(encryptedDek),
      ).rejects.toThrow();
    });

    it('should fail with tampered encrypted DEK', async () => {
      const { encryptedDek } = await provider.generateDataKey();
      const buffer = Buffer.from(encryptedDek, 'base64');
      buffer[10] = buffer[10] ^ 0xff;
      const tampered = buffer.toString('base64');

      await expect(provider.decryptDataKey(tampered)).rejects.toThrow();
    });
  });
});
