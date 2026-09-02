import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';

const { testDek } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('node:crypto');
  return { testDek: crypto.randomBytes(32) as Buffer };
});

vi.mock('@aws-sdk/client-kms', () => ({
  KMSClient: vi.fn(function () {
    return { send: vi.fn().mockResolvedValue({ Plaintext: testDek }) };
  }),
  DecryptCommand: vi.fn(function (input: unknown) {
    return input;
  }),
  GenerateDataKeyCommand: vi.fn(),
}));

import { encryptContent } from '../thread-encryption';
import { decryptMessageContents } from '../decrypt-messages';

describe('decryptMessageContents', () => {
  const encryptedDek = randomBytes(64).toString('base64');

  beforeEach(() => {
    vi.stubEnv('AWS_KMS_KEY_ID', 'arn:aws:kms:eu-west-1:123456789:key/test');
    vi.stubEnv('AWS_DEFAULT_REGION', 'eu-west-1');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('decrypts message contents when DEK is provided', async () => {
    const encrypted1 = encryptContent('Hello', testDek);
    const encrypted2 = encryptContent('World', testDek);

    const messages = [
      { content: encrypted1, role: 'USER' },
      { content: encrypted2, role: 'ASSISTANT' },
    ];

    const result = await decryptMessageContents(messages, encryptedDek);

    expect(result[0].content).toBe('Hello');
    expect(result[0].role).toBe('USER');
    expect(result[1].content).toBe('World');
    expect(result[1].role).toBe('ASSISTANT');
  });

  it('returns messages unchanged when no DEK', async () => {
    const messages = [{ content: 'plaintext', role: 'USER' }];

    const result = await decryptMessageContents(messages, null);
    expect(result).toBe(messages); // same reference
  });

  it('decrypts even when AWS_KMS_KEY_ID is unset (encrypted data must always be readable)', async () => {
    vi.stubEnv('AWS_KMS_KEY_ID', '');

    const encrypted = encryptContent('decrypted OK', testDek);
    const messages = [{ content: encrypted, role: 'USER' }];
    const result = await decryptMessageContents(messages, encryptedDek);
    expect(result[0].content).toBe('decrypted OK');
  });

  it('returns empty array for empty messages', async () => {
    const result = await decryptMessageContents([], encryptedDek);
    expect(result).toEqual([]);
  });

  it('preserves all extra fields on messages', async () => {
    const encrypted = encryptContent('test', testDek);
    const messages = [
      {
        content: encrypted,
        role: 'USER',
        publicId: 'abc-123',
        createdAt: '2026-01-01',
        extra: 'data',
      },
    ];

    const result = await decryptMessageContents(messages, encryptedDek);
    expect(result[0].content).toBe('test');
    expect(result[0].publicId).toBe('abc-123');
    expect(result[0].createdAt).toBe('2026-01-01');
    expect(result[0].extra).toBe('data');
  });
});
