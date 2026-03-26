import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock KMS before importing the module
const mockGenerateDataKey = vi.fn();
const mockDecrypt = vi.fn();

vi.mock('@aws-sdk/client-kms', () => ({
  KMSClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockImplementation((command) => {
      if (command.constructor.name === 'GenerateDataKeyCommand') {
        return mockGenerateDataKey();
      }
      if (command.constructor.name === 'DecryptCommand') {
        return mockDecrypt(command);
      }
      throw new Error(`Unexpected command: ${command.constructor.name}`);
    }),
  })),
  GenerateDataKeyCommand: vi.fn().mockImplementation((input) => {
    return { ...input, constructor: { name: 'GenerateDataKeyCommand' } };
  }),
  DecryptCommand: vi.fn().mockImplementation((input) => {
    return { ...input, constructor: { name: 'DecryptCommand' } };
  }),
}));

import { randomBytes } from 'node:crypto';
import {
  isEncryptionEnabled,
  encryptContent,
  decryptContent,
  generateThreadKey,
  decryptThreadKey,
  encryptMessages,
  decryptMessages,
  clearDekCache,
} from '../thread-encryption';

describe('thread-encryption', () => {
  const testDek = randomBytes(32);
  const testEncryptedDek = randomBytes(64);

  beforeEach(() => {
    vi.stubEnv(
      'AWS_KMS_KEY_ID',
      'arn:aws:kms:eu-west-1:123456789:key/test-key',
    );
    vi.stubEnv('AWS_DEFAULT_REGION', 'eu-west-1');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-access-key');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret-key');
    clearDekCache();

    mockGenerateDataKey.mockResolvedValue({
      Plaintext: testDek,
      CiphertextBlob: testEncryptedDek,
    });

    mockDecrypt.mockResolvedValue({
      Plaintext: testDek,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('isEncryptionEnabled', () => {
    it('returns true when AWS_KMS_KEY_ID is set', () => {
      expect(isEncryptionEnabled()).toBe(true);
    });

    it('returns false when AWS_KMS_KEY_ID is not set', () => {
      vi.stubEnv('AWS_KMS_KEY_ID', '');
      expect(isEncryptionEnabled()).toBe(false);
    });
  });

  describe('encryptContent / decryptContent', () => {
    it('encrypts and decrypts a simple message', () => {
      const plaintext = 'Hello, world!';
      const encrypted = encryptContent(plaintext, testDek);

      expect(encrypted).not.toBe(plaintext);
      expect(typeof encrypted).toBe('string');

      const decrypted = decryptContent(encrypted, testDek);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts unicode content', () => {
      const plaintext = 'Cześć! 🇵🇱 日本語テスト';
      const encrypted = encryptContent(plaintext, testDek);
      const decrypted = decryptContent(encrypted, testDek);
      expect(decrypted).toBe(plaintext);
    });

    it('encrypts and decrypts empty string', () => {
      const encrypted = encryptContent('', testDek);
      const decrypted = decryptContent(encrypted, testDek);
      expect(decrypted).toBe('');
    });

    it('encrypts and decrypts long content', () => {
      const plaintext = 'A'.repeat(100_000);
      const encrypted = encryptContent(plaintext, testDek);
      const decrypted = decryptContent(encrypted, testDek);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext for same plaintext (unique IV)', () => {
      const plaintext = 'Same message';
      const encrypted1 = encryptContent(plaintext, testDek);
      const encrypted2 = encryptContent(plaintext, testDek);
      expect(encrypted1).not.toBe(encrypted2);

      // Both decrypt to the same plaintext
      expect(decryptContent(encrypted1, testDek)).toBe(plaintext);
      expect(decryptContent(encrypted2, testDek)).toBe(plaintext);
    });

    it('fails to decrypt with wrong key', () => {
      const plaintext = 'Secret message';
      const encrypted = encryptContent(plaintext, testDek);
      const wrongKey = randomBytes(32);

      expect(() => decryptContent(encrypted, wrongKey)).toThrow();
    });

    it('fails to decrypt tampered ciphertext', () => {
      const plaintext = 'Tamper test';
      const encrypted = encryptContent(plaintext, testDek);
      const buffer = Buffer.from(encrypted, 'base64');
      // Flip a byte in the middle of ciphertext
      buffer[20] = buffer[20] ^ 0xff;
      const tampered = buffer.toString('base64');

      expect(() => decryptContent(tampered, testDek)).toThrow();
    });
  });

  describe('generateThreadKey', () => {
    it('returns encrypted DEK and plaintext DEK from KMS', async () => {
      const result = await generateThreadKey();

      expect(result.encryptedDek).toBe(testEncryptedDek.toString('base64'));
      expect(Buffer.isBuffer(result.plaintextDek)).toBe(true);
      expect(result.plaintextDek).toEqual(testDek);
      expect(mockGenerateDataKey).toHaveBeenCalledOnce();
    });
  });

  describe('decryptThreadKey', () => {
    it('decrypts an encrypted DEK via KMS', async () => {
      const encryptedDekBase64 = testEncryptedDek.toString('base64');
      const result = await decryptThreadKey(encryptedDekBase64);

      expect(result).toEqual(testDek);
      expect(mockDecrypt).toHaveBeenCalledOnce();
    });

    it('caches decrypted DEK', async () => {
      const encryptedDekBase64 = testEncryptedDek.toString('base64');

      await decryptThreadKey(encryptedDekBase64);
      await decryptThreadKey(encryptedDekBase64);

      // KMS should only be called once
      expect(mockDecrypt).toHaveBeenCalledOnce();
    });

    it('cache is cleared by clearDekCache', async () => {
      const encryptedDekBase64 = testEncryptedDek.toString('base64');

      await decryptThreadKey(encryptedDekBase64);
      clearDekCache();
      await decryptThreadKey(encryptedDekBase64);

      expect(mockDecrypt).toHaveBeenCalledTimes(2);
    });
  });

  describe('encryptMessages / decryptMessages', () => {
    it('encrypts and decrypts multiple messages', async () => {
      const messages = [
        { content: 'First message' },
        { content: 'Second message' },
        { content: 'Third message' },
      ];

      const { encryptedContents, encryptedDek } =
        await encryptMessages(messages);

      expect(encryptedContents).toHaveLength(3);
      expect(encryptedContents[0]).not.toBe('First message');
      expect(encryptedDek).toBe(testEncryptedDek.toString('base64'));

      const decrypted = await decryptMessages(encryptedContents, encryptedDek);

      expect(decrypted).toEqual([
        'First message',
        'Second message',
        'Third message',
      ]);
    });

    it('reuses existing DEK when provided', async () => {
      const existingDek = testEncryptedDek.toString('base64');

      await encryptMessages([{ content: 'test' }], existingDek);

      // Should decrypt the existing DEK, not generate a new one
      expect(mockDecrypt).toHaveBeenCalledOnce();
      expect(mockGenerateDataKey).not.toHaveBeenCalled();
    });

    it('generates new DEK when not provided', async () => {
      await encryptMessages([{ content: 'test' }]);

      expect(mockGenerateDataKey).toHaveBeenCalledOnce();
      expect(mockDecrypt).not.toHaveBeenCalled();
    });
  });
});
