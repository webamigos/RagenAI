import { decryptContent, decryptThreadKey } from './thread-encryption.js';

/**
 * Ported from ragen-app's src/libs/crypto/decrypt-messages.ts — excluded
 * from the original crypto slice ("not needed since persist-api-thread.ts
 * only writes") but needed now by messages/messages.service.ts's
 * getThreadMessages (the read side). See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Decrypt message contents for a thread that has an encrypted DEK.
 * Returns messages with decrypted content. If no DEK, returns messages
 * unchanged. Decryption is always attempted when encryptedDek is present,
 * regardless of whether encryption is currently enabled — encrypted data
 * must always be readable.
 */
export async function decryptMessageContents<T extends { content: string }>(
  messages: T[],
  encryptedDek: string | null | undefined,
): Promise<T[]> {
  if (!encryptedDek || messages.length === 0) {
    return messages;
  }

  const dek = await decryptThreadKey(encryptedDek);

  return messages.map((msg) => ({
    ...msg,
    content: decryptContent(msg.content, dek),
  }));
}
