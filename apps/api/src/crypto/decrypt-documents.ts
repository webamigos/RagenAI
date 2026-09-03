import { decryptContent, decryptThreadKey } from './thread-encryption.js';

/**
 * Ported from apps/web's src/libs/crypto/decrypt-documents.ts — excluded
 * from the original crypto slice ("nothing ported so far needs it") but
 * needed now by documents/files.service.ts's read-side document queries.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Decrypt document content if the document has an encrypted DEK. Returns
 * content unchanged if no DEK is present.
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
