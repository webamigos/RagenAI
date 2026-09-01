import { getOrCreatePiiDek } from '@/features/organizations/services/organization-settings';
import { decryptContent } from '@/libs/crypto/thread-encryption';
import { logger } from '@/app/lib/utils/logger';
import type {
  VectorStoreClient,
  VectorStoreDocument,
} from '@/libs/vector-store/types';

export function wrapVectorStoreWithDualContentDecode(
  store: VectorStoreClient,
  orgId: string,
): VectorStoreClient {
  return {
    similaritySearch: async (query: string, k: number, filter?: object) => {
      const results = await store.similaritySearch(query, k, filter);
      return decodeDualContentChunks(results, orgId);
    },
    addDocuments: store.addDocuments.bind(store),
    ...(store.deleteDocuments
      ? { deleteDocuments: store.deleteDocuments.bind(store) }
      : {}),
  };
}

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
    } catch (err) {
      logger.warn(
        { err, orgId },
        'decodeDualContentChunks: failed to decrypt content_original, falling back to masked content',
      );
      return chunk;
    }
  });
}
