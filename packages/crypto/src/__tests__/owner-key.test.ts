import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { encryptContent } from '../envelope';
import { resetKeyProviderForTests } from '../key-provider';
import {
  openOwnedRows,
  resolveOwnerKeyForTransaction,
  resolveOwnerKeyForWrite,
  sealOwnedContent,
  type OwnerKeyStore,
} from '../owner-key';
import { clearDekCache, decryptThreadKey } from '../thread-encryption';

const HEX_KEY = Buffer.alloc(32, 7).toString('hex');
const ENV = ['ENCRYPTION_PROVIDER', 'ENCRYPTION_MASTER_KEY'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  process.env.ENCRYPTION_PROVIDER = 'local';
  process.env.ENCRYPTION_MASTER_KEY = HEX_KEY;
  resetKeyProviderForTests();
  clearDekCache();
});

afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
  resetKeyProviderForTests();
  clearDekCache();
  vi.restoreAllMocks();
});

/** A row's `encrypted_dek` column, with the conditional update. */
function memoryStore(initial: string | null = null) {
  let column = initial;
  const store: OwnerKeyStore & { column: () => string | null } = {
    load: vi.fn(async () => column),
    saveIfAbsent: vi.fn(async (dek: string) => {
      if (column !== null) {
        return false;
      }
      column = dek;
      return true;
    }),
    column: () => column,
  };
  return store;
}

describe('resolveOwnerKeyForWrite', () => {
  it('creates the key once, stores it, and reuses it afterwards', async () => {
    const store = memoryStore();

    const first = await resolveOwnerKeyForWrite(store);
    const second = await resolveOwnerKeyForWrite(store);

    expect(first.status).toBe('key');
    expect(store.saveIfAbsent).toHaveBeenCalledTimes(1);
    expect(store.column()).not.toBeNull();
    expect(second).toEqual(first);
  });

  it('uses the key a concurrent writer stored first', async () => {
    const store = memoryStore();
    // Both read "no key", then race to store one.
    const [a, b] = await Promise.all([
      resolveOwnerKeyForWrite(store),
      resolveOwnerKeyForWrite(store),
    ]);

    expect(a.status).toBe('key');
    expect(b.status).toBe('key');
    const stored = await decryptThreadKey(store.column()!);
    expect(a.status === 'key' && a.dek.equals(stored)).toBe(true);
    expect(b.status === 'key' && b.dek.equals(stored)).toBe(true);
  });

  it('returns unavailable, never plaintext, when encryption is on and the key cannot be had', async () => {
    const store = memoryStore('not-a-wrapped-key');
    const result = await resolveOwnerKeyForWrite(store);
    expect(result.status).toBe('unavailable');
  });

  it('returns unavailable when the store itself fails', async () => {
    const store = memoryStore();
    vi.mocked(store.load).mockRejectedValue(new Error('db down'));
    expect((await resolveOwnerKeyForWrite(store)).status).toBe('unavailable');
  });

  it('writes plaintext when encryption is off for the installation', async () => {
    delete process.env.ENCRYPTION_PROVIDER;
    delete process.env.ENCRYPTION_MASTER_KEY;
    resetKeyProviderForTests();
    const store = memoryStore();

    expect(await resolveOwnerKeyForWrite(store)).toEqual({
      status: 'plaintext',
    });
    expect(store.saveIfAbsent).not.toHaveBeenCalled();
  });
});

describe('sealOwnedContent and openOwnedRows', () => {
  it('round-trips under the owner key, flagging the row', async () => {
    const store = memoryStore();
    const key = await resolveOwnerKeyForWrite(store);
    if (key.status === 'unavailable') {
      throw new Error('expected a key');
    }

    const sealed = sealOwnedContent('Prefers bullet points.', key);
    expect(sealed.isEncrypted).toBe(true);
    expect(sealed.content).not.toContain('bullet');

    const [opened] = await openOwnedRows([sealed], store);
    expect(opened.content).toBe('Prefers bullet points.');
  });

  it('reads a mixed profile: plaintext rows from before the key, encrypted after', async () => {
    const store = memoryStore();
    const plaintextRow = { content: 'Is the CFO.', isEncrypted: false };
    const key = await resolveOwnerKeyForWrite(store);
    if (key.status !== 'key') {
      throw new Error('expected a key');
    }
    const encryptedRow = {
      content: encryptContent('Prefers bullet points.', key.dek),
      isEncrypted: true,
    };

    const opened = await openOwnedRows([plaintextRow, encryptedRow], store);

    expect(opened.map((r) => r.content)).toEqual([
      'Is the CFO.',
      'Prefers bullet points.',
    ]);
  });

  it('never loads a key for a profile with no encrypted rows', async () => {
    const store = memoryStore();
    const rows = [{ content: 'Is the CFO.', isEncrypted: false }];
    expect(await openOwnedRows(rows, store)).toEqual(rows);
    expect(store.load).not.toHaveBeenCalled();
  });

  it('refuses a row marked encrypted whose owner has no key', async () => {
    await expect(
      openOwnedRows([{ content: 'x', isEncrypted: true }], memoryStore()),
    ).rejects.toThrow('no key');
  });

  it('stores plaintext unflagged when encryption is off', () => {
    expect(sealOwnedContent('Is the CFO.', { status: 'plaintext' })).toEqual({
      content: 'Is the CFO.',
      isEncrypted: false,
    });
  });
});

describe('resolveOwnerKeyForTransaction', () => {
  it('generates a key without storing it, for the caller’s transaction to store', async () => {
    const store = memoryStore();
    const result = await resolveOwnerKeyForTransaction(store);

    expect(result.status).toBe('key');
    expect(result.status === 'key' && result.newEncryptedDek).toBeTruthy();
    expect(
      result.status === 'key' && result.encryptedDek === result.newEncryptedDek,
    ).toBe(true);
    expect(store.saveIfAbsent).not.toHaveBeenCalled();
    // The new key is the one its wrapped form unwraps to.
    if (result.status === 'key' && result.newEncryptedDek) {
      expect(
        (await decryptThreadKey(result.newEncryptedDek)).equals(result.dek),
      ).toBe(true);
    }
  });

  it('unwraps an existing key and asks for nothing to be stored', async () => {
    const first = await resolveOwnerKeyForWrite(memoryStore());
    const store = memoryStore();
    await resolveOwnerKeyForWrite(store); // stores one
    const result = await resolveOwnerKeyForTransaction(store);

    expect(first.status).toBe('key');
    expect(result).toMatchObject({ status: 'key', newEncryptedDek: null });
    // The wrapped key it unwrapped, for the caller's transaction to check
    // the profile still holds.
    expect(result.status === 'key' && result.encryptedDek).toBeTruthy();
  });

  it('is unavailable, never plaintext, when encryption is on and the key fails', async () => {
    expect(
      (await resolveOwnerKeyForTransaction(memoryStore('not-a-wrapped-key')))
        .status,
    ).toBe('unavailable');
  });

  it('is plaintext when encryption is off', async () => {
    delete process.env.ENCRYPTION_PROVIDER;
    delete process.env.ENCRYPTION_MASTER_KEY;
    resetKeyProviderForTests();
    expect(await resolveOwnerKeyForTransaction(memoryStore())).toEqual({
      status: 'plaintext',
    });
  });
});
