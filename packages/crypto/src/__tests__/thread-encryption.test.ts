import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();

vi.mock('@aws-sdk/client-kms', () => ({
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

import { resetKeyProviderForTests } from '../key-provider';
import {
  clearDekCache,
  decryptThreadKey,
  decryptDocumentContent,
  decryptMessageContents,
  decryptMessages,
  encryptMessages,
  generateThreadKey,
  isEncryptionEnabled,
} from '../thread-encryption';

const HEX_KEY = Buffer.alloc(32, 5).toString('hex');
let saved: string | undefined;
let savedProvider: string | undefined;

beforeEach(() => {
  saved = process.env.ENCRYPTION_MASTER_KEY;
  savedProvider = process.env.ENCRYPTION_PROVIDER;
  process.env.ENCRYPTION_PROVIDER = 'local';
  process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;
  resetKeyProviderForTests();
  clearDekCache();
});

afterEach(() => {
  process.env.ENCRYPTION_MASTER_KEY = saved;
  process.env.ENCRYPTION_PROVIDER = savedProvider;
  if (saved === undefined) {
    delete process.env.ENCRYPTION_MASTER_KEY;
  }
  if (savedProvider === undefined) {
    delete process.env.ENCRYPTION_PROVIDER;
  }
  resetKeyProviderForTests();
  clearDekCache();
});

describe('thread keys', () => {
  it('reports encryption as enabled when a provider is configured', () => {
    expect(isEncryptionEnabled()).toBe(true);
  });

  it('encrypts and decrypts a set of messages under one key', async () => {
    const { encryptedContents, encryptedDek } = await encryptMessages([
      { content: 'first' },
      { content: 'second' },
    ]);

    expect(encryptedContents).toHaveLength(2);
    expect(encryptedContents[0]).not.toContain('first');
    expect(await decryptMessages(encryptedContents, encryptedDek)).toEqual([
      'first',
      'second',
    ]);
  });

  it('reuses an existing thread key rather than minting a second', async () => {
    const { encryptedDek } = await generateThreadKey();

    const result = await encryptMessages([{ content: 'x' }], encryptedDek);

    expect(result.encryptedDek).toBe(encryptedDek);
  });
});

describe('decryptMessageContents', () => {
  it('returns the messages untouched when the thread has no key', async () => {
    const messages = [{ id: 1, content: 'plain' }];

    expect(await decryptMessageContents(messages, null)).toBe(messages);
  });

  it('decrypts in place and keeps the other fields', async () => {
    const { encryptedContents, encryptedDek } = await encryptMessages([
      { content: 'secret' },
    ]);

    const result = await decryptMessageContents(
      [{ id: 7, role: 'USER', content: encryptedContents[0] }],
      encryptedDek,
    );

    expect(result[0]).toEqual({ id: 7, role: 'USER', content: 'secret' });
  });

  it('decrypts even when encryption has since been turned off', async () => {
    // Existing conversations must stay readable after the feature is
    // disabled, which is why this path checks for a DEK and not for the
    // feature flag.
    const { encryptedContents, encryptedDek } = await encryptMessages([
      { content: 'archived' },
    ]);

    const result = await decryptMessageContents(
      [{ content: encryptedContents[0] }],
      encryptedDek,
    );

    expect(result[0].content).toBe('archived');
  });
});

describe('decryptDocumentContent', () => {
  it('passes content through when there is no key', async () => {
    expect(await decryptDocumentContent('as-is', undefined)).toBe('as-is');
  });

  it('decrypts when there is one', async () => {
    const { encryptedContents, encryptedDek } = await encryptMessages([
      { content: 'body' },
    ]);

    expect(
      await decryptDocumentContent(encryptedContents[0], encryptedDek),
    ).toBe('body');
  });
});

describe('the DEK cache', () => {
  /**
   * Rendering a thread decrypts every message with the same key, so without
   * the cache each message is a KMS round trip. Counted through the AWS
   * provider because its client is mockable; the behaviour is the provider's
   * caller, not the provider.
   */
  const WRAPPED = Buffer.from('wrapped').toString('base64');

  beforeEach(() => {
    process.env.ENCRYPTION_PROVIDER = 'kms';
    process.env.AWS_KMS_KEY_ID = 'arn:key';
    delete process.env.ENCRYPTION_MASTER_KEY;
    resetKeyProviderForTests();
    clearDekCache();
    send.mockReset();
    send.mockResolvedValue({ Plaintext: Buffer.alloc(32, 4) });
  });

  afterEach(() => {
    delete process.env.AWS_KMS_KEY_ID;
    clearDekCache();
  });

  it('unwraps a given DEK once, however many times it is asked for', async () => {
    await decryptThreadKey(WRAPPED);
    await decryptThreadKey(WRAPPED);
    await decryptThreadKey(WRAPPED);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('asks again after clearDekCache', async () => {
    // The entries are plaintext key material, so the ability to drop them is
    // part of the contract, not an optimisation detail.
    await decryptThreadKey(WRAPPED);
    clearDekCache();
    await decryptThreadKey(WRAPPED);

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not serve one thread key for another', async () => {
    const other = Buffer.from('other-wrapped').toString('base64');

    await decryptThreadKey(WRAPPED);
    await decryptThreadKey(other);

    expect(send).toHaveBeenCalledTimes(2);
  });
});
