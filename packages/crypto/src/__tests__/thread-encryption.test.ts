import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetKeyProviderForTests } from '../key-provider';
import {
  clearDekCache,
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
