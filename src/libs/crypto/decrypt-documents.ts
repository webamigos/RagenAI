import { decryptContent, decryptThreadKey } from './thread-encryption';

/**
 * Decrypt document content if the document has an encrypted DEK.
 * Returns content unchanged if no DEK is present.
 */
export async function decryptDocumentContent(
  content: string,
  encryptedDek: string | null | undefined,
): Promise<string> {
  if (!encryptedDek) {
    return content;
  }

  const dek = await decryptThreadKey(encryptedDek);
  return decryptContent(content, dek);
}
