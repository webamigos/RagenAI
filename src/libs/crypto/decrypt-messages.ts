import { decryptContent, decryptThreadKey } from './thread-encryption';

/**
 * Decrypt message contents for a thread that has an encrypted DEK.
 * Returns messages with decrypted content. If no DEK, returns messages unchanged.
 * Note: decryption is always attempted when encryptedDek is present, regardless
 * of whether encryption is currently enabled — encrypted data must always be readable.
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
