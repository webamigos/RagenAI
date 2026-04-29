import { getOrCreatePiiDek } from '@/features/organizations/services/organization-settings';
import { decryptContent } from '@/libs/crypto/thread-encryption';
import type { VectorStoreDocument } from '@/libs/vector-store/types';

export async function decodeDualContentChunks(
  chunks: VectorStoreDocument[],
  orgId: string,
): Promise<VectorStoreDocument[]> {
  const hasDualContent = chunks.some(
    (c) =>
      c.metadata.pii_mode === 'dual_content' &&
      typeof c.metadata.content_original === 'string',
  );

  if (!hasDualContent) {
    return chunks;
  }

  const dek = await getOrCreatePiiDek(orgId);

  return chunks.map((chunk) => {
    if (
      chunk.metadata.pii_mode !== 'dual_content' ||
      typeof chunk.metadata.content_original !== 'string'
    ) {
      return chunk;
    }
    try {
      const decrypted = decryptContent(chunk.metadata.content_original, dek);
      return { ...chunk, pageContent: decrypted };
    } catch {
      return chunk;
    }
  });
}
