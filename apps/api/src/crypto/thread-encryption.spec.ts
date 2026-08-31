const mockGenerateDataKey = jest.fn();
const mockDecryptDataKey = jest.fn();

jest.mock('./key-provider/index.js', () => ({
  getKeyProvider: () => ({
    generateDataKey: mockGenerateDataKey,
    decryptDataKey: mockDecryptDataKey,
  }),
  isEncryptionConfigured: () =>
    !!process.env.AWS_KMS_KEY_ID || !!process.env.ENCRYPTION_MASTER_KEY,
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
} from './thread-encryption.js';

describe('thread-encryption', () => {
  const testDek = randomBytes(32);
  const testEncryptedDek = randomBytes(64).toString('base64');
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AWS_KMS_KEY_ID: 'arn:aws:kms:eu-west-1:123456789:key/test-key',
    };
    clearDekCache();

    mockGenerateDataKey.mockResolvedValue({
      plaintextDek: testDek,
      encryptedDek: testEncryptedDek,
    });

    mockDecryptDataKey.mockResolvedValue(testDek);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('isEncryptionEnabled', () => {
    it('returns true when AWS_KMS_KEY_ID is set', () => {
      expect(isEncryptionEnabled()).toBe(true);
    });

    it('returns true when ENCRYPTION_MASTER_KEY is set', () => {
      delete process.env.AWS_KMS_KEY_ID;
      process.env.ENCRYPTION_MASTER_KEY = randomBytes(32).toString('hex');
      expect(isEncryptionEnabled()).toBe(true);
    });

    it('returns false when neither is set', () => {
      delete process.env.AWS_KMS_KEY_ID;
      delete process.env.ENCRYPTION_MASTER_KEY;
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
      buffer[20] = buffer[20] ^ 0xff;
      const tampered = buffer.toString('base64');

      expect(() => decryptContent(tampered, testDek)).toThrow();
    });
  });

  describe('generateThreadKey', () => {
    it('returns encrypted DEK and plaintext DEK from key provider', async () => {
      const result = await generateThreadKey();

      expect(result.encryptedDek).toBe(testEncryptedDek);
      expect(Buffer.isBuffer(result.plaintextDek)).toBe(true);
      expect(result.plaintextDek).toEqual(testDek);
      expect(mockGenerateDataKey).toHaveBeenCalledTimes(1);
    });
  });

  describe('decryptThreadKey', () => {
    it('decrypts an encrypted DEK via key provider', async () => {
      const result = await decryptThreadKey(testEncryptedDek);

      expect(result).toEqual(testDek);
      expect(mockDecryptDataKey).toHaveBeenCalledTimes(1);
    });

    it('caches decrypted DEK', async () => {
      await decryptThreadKey(testEncryptedDek);
      await decryptThreadKey(testEncryptedDek);

      expect(mockDecryptDataKey).toHaveBeenCalledTimes(1);
    });

    it('cache is cleared by clearDekCache', async () => {
      await decryptThreadKey(testEncryptedDek);
      clearDekCache();
      await decryptThreadKey(testEncryptedDek);

      expect(mockDecryptDataKey).toHaveBeenCalledTimes(2);
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
      expect(encryptedDek).toBe(testEncryptedDek);

      const decrypted = await decryptMessages(encryptedContents, encryptedDek);

      expect(decrypted).toEqual([
        'First message',
        'Second message',
        'Third message',
      ]);
    });

    it('reuses existing DEK when provided', async () => {
      await encryptMessages([{ content: 'test' }], testEncryptedDek);

      expect(mockDecryptDataKey).toHaveBeenCalledTimes(1);
      expect(mockGenerateDataKey).not.toHaveBeenCalled();
    });

    it('generates new DEK when not provided', async () => {
      await encryptMessages([{ content: 'test' }]);

      expect(mockGenerateDataKey).toHaveBeenCalledTimes(1);
      expect(mockDecryptDataKey).not.toHaveBeenCalled();
    });
  });
});
