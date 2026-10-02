import { decryptContent, encryptContent } from './envelope';
import { assertEncryptionAvailable } from './require-encryption';
import {
  decryptThreadKey,
  generateThreadKey,
  isEncryptionEnabled,
} from './thread-encryption';

/**
 * A DEK for content whose owner is not a thread (ADR-42, as amended for
 * owner keys; spec 2026-09-27-personal-memory-across-threads).
 *
 * A thread's derived content is encrypted under the thread's key because it
 * belongs to one message. A personal memory belongs to no message: it is
 * written in one thread and read in others, so its key is the owner's — one
 * per (user, organization). The key comes from the same provider and the same
 * primitives as a thread's, and this module is the one function per owner
 * kind that the amendment allows beside the thread path.
 *
 * Written against a two-method store so the web app (a user editing a memory)
 * and the worker (extraction) resolve the key the same way, each with its own
 * Prisma read.
 */
export interface OwnerKeyStore {
  /** The owner's wrapped DEK, or null when it has none yet. */
  load(): Promise<string | null>;
  /**
   * Store `encryptedDek` only if the owner still has none — a conditional
   * update where the column is null. Returns whether this call stored it.
   */
  saveIfAbsent(encryptedDek: string): Promise<boolean>;
}

/**
 * What a write may do.
 *
 * - `plaintext`: encryption is off for the installation, so the content is
 *   stored as is, exactly like a message.
 * - `key`: encrypt under `dek`.
 * - `unavailable`: encryption is on (or required) and the key could not be
 *   obtained. **The caller writes nothing.** This is where an owner key
 *   departs from ADR-42's thread path, on purpose: a memory is read in other
 *   threads, which may be encrypted, so storing it as plaintext would be the
 *   divergence ADR-42 exists to prevent — and losing one extraction costs
 *   nothing.
 */
export type OwnerKeyForWrite =
  | { status: 'plaintext' }
  | { status: 'key'; dek: Buffer }
  | { status: 'unavailable'; error: unknown };

export async function resolveOwnerKeyForWrite(
  store: OwnerKeyStore,
): Promise<OwnerKeyForWrite> {
  if (!isEncryptionEnabled()) {
    try {
      // A deployment that requires encryption and has no usable provider
      // refuses every write, as the thread path does.
      assertEncryptionAvailable();
    } catch (error) {
      return { status: 'unavailable', error };
    }
    return { status: 'plaintext' };
  }

  try {
    const existing = await store.load();
    if (existing) {
      return { status: 'key', dek: await decryptThreadKey(existing) };
    }

    const key = await generateThreadKey();
    if (await store.saveIfAbsent(key.encryptedDek)) {
      return { status: 'key', dek: key.plaintextDek };
    }

    // Another writer stored a key first; use theirs, or two rows of one owner
    // would be encrypted under keys only one of which is on the row.
    const winner = await store.load();
    if (!winner) {
      throw new Error(
        'The owner key was neither stored by this call nor by a concurrent one',
      );
    }
    return { status: 'key', dek: await decryptThreadKey(winner) };
  } catch (error) {
    return { status: 'unavailable', error };
  }
}

/**
 * A write that stores the key in its own transaction.
 *
 * `resolveOwnerKeyForWrite` stores a new key at once, which creates the
 * owner's profile row. A background writer must not: the job that extracts a
 * memory may run after the member was removed, and its whole write — profile
 * included — has to be one transaction that a failed membership check rolls
 * back. So this resolves the key without storing it: an existing key is
 * unwrapped; otherwise a new one is generated and handed back as
 * `newEncryptedDek`, for the caller to store with a conditional update inside
 * its transaction (and to retry under the winner's key if that update loses).
 * No KMS round trip happens inside the transaction either way (ADR-42).
 */
export type OwnerKeyForTransaction =
  | { status: 'plaintext' }
  | { status: 'key'; dek: Buffer; newEncryptedDek: string | null }
  | { status: 'unavailable'; error: unknown };

export async function resolveOwnerKeyForTransaction(
  store: Pick<OwnerKeyStore, 'load'>,
): Promise<OwnerKeyForTransaction> {
  if (!isEncryptionEnabled()) {
    try {
      assertEncryptionAvailable();
    } catch (error) {
      return { status: 'unavailable', error };
    }
    return { status: 'plaintext' };
  }

  try {
    const existing = await store.load();
    if (existing) {
      return {
        status: 'key',
        dek: await decryptThreadKey(existing),
        newEncryptedDek: null,
      };
    }
    const key = await generateThreadKey();
    return {
      status: 'key',
      dek: key.plaintextDek,
      newEncryptedDek: key.encryptedDek,
    };
  } catch (error) {
    return { status: 'unavailable', error };
  }
}

/** Content as a write stores it, with the flag the read needs. */
export function sealOwnedContent(
  content: string,
  key:
    | Exclude<OwnerKeyForWrite, { status: 'unavailable' }>
    | Exclude<OwnerKeyForTransaction, { status: 'unavailable' }>,
): { content: string; isEncrypted: boolean } {
  return key.status === 'key'
    ? { content: encryptContent(content, key.dek), isEncrypted: true }
    : { content, isEncrypted: false };
}

/**
 * Decrypt the rows flagged as encrypted, and pass the rest through.
 *
 * Each row carries `isEncrypted` rather than the read inferring it from the
 * owner's key, as a thread can: a profile may hold plaintext rows written
 * while encryption was off and gain a key later, and `decryptContent` throws
 * on plaintext, so inferring would make every older row unreadable the
 * moment the first encrypted one was written. Like a thread, it decrypts
 * whenever a row needs it, whether or not encryption is enabled now.
 *
 * Throws when a row is flagged but the owner has no key, or the key cannot be
 * unwrapped; the read path catches it and runs the turn without memory.
 */
export async function openOwnedRows<
  T extends { content: string; isEncrypted: boolean },
>(rows: readonly T[], store: Pick<OwnerKeyStore, 'load'>): Promise<T[]> {
  if (!rows.some((row) => row.isEncrypted)) {
    return [...rows];
  }

  const encryptedDek = await store.load();
  if (!encryptedDek) {
    throw new Error('Rows are marked encrypted, but their owner has no key');
  }
  const dek = await decryptThreadKey(encryptedDek);

  return rows.map((row) =>
    row.isEncrypted
      ? { ...row, content: decryptContent(row.content, dek) }
      : row,
  );
}
