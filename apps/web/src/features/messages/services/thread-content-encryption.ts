import db from '@ragenai/prisma-client';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
  decryptThreadKey,
} from '@ragenai/crypto';

/**
 * Encrypts content under a thread's own key, or returns it unchanged when the
 * deployment has encryption off.
 *
 * Its own module because two different things are written under one thread's
 * key: the message, and the source snippets that quote the documents behind
 * it. Gap 5 of `docs/specs/2026-09-09-design-system-v2-functional-gaps.md`
 * states the rule as "the same key and the same mode as the message it belongs
 * to" — the way to guarantee that is for both callers to run the same code,
 * not to reimplement these branches and hope they stay in step.
 *
 * It also creates the thread's key if there is not one yet, which is why the
 * race below exists: two turns can arrive together on a thread's first
 * message.
 */
export async function maybeEncryptContent(
  threadId: string,
  content: string,
): Promise<string> {
  if (!isEncryptionEnabled()) {
    return content;
  }

  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    select: { encryptedDek: true },
  });

  let dek: Buffer;

  if (thread.encryptedDek) {
    dek = await decryptThreadKey(thread.encryptedDek);
  } else {
    const key = await generateThreadKey();
    dek = key.plaintextDek;

    // Conditional update to avoid race condition: only set DEK if still null
    const result = await db.thread.updateMany({
      where: { id: threadId, encryptedDek: null },
      data: { encryptedDek: key.encryptedDek },
    });

    // Another request won the race — use their key instead
    if (result.count === 0) {
      const updated = await db.thread.findUniqueOrThrow({
        where: { id: threadId },
        select: { encryptedDek: true },
      });
      if (!updated.encryptedDek) {
        throw new Error('Failed to initialize thread encryption key');
      }
      dek = await decryptThreadKey(updated.encryptedDek);
    }
  }

  return encryptContent(content, dek);
}
