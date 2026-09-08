import { Logger } from '@nestjs/common';
import { decryptContent } from '@ragenai/crypto';
import type {
  VectorStoreClient,
  VectorStoreDocument,
} from '../../vector-store/types.js';

const logger = new Logger('DualContentDecode');

/**
 * Ported from apps/web's
 * src/app/api/threads/services/decode-dual-content-chunks.ts — closes the
 * KNOWN GAP flagged when `initialize-basic-rag.service.ts` was first
 * ported (see docs/adrs/21-monorepo-and-api-decoupling.md). For the
 * opt-in, default-off `piiIngestionMode: 'dual_content'` org setting,
 * retrieved chunks carry a masked `pageContent` plus an encrypted
 * `metadata.content_original` — this decrypts it back for chunks that
 * have it, and passes everything else through untouched.
 *
 * `getOrCreatePiiDek` is injected (not a global import) — same
 * callback-threading pattern as `trackAiUsage`/`recordSecurityEvent` in
 * earlier slices — so this stays plain, framework-agnostic TS. A real
 * caller passes `organizationSettingsService.getOrCreatePiiDek.bind(...)`.
 */
export type GetOrCreatePiiDek = (orgId: string) => Promise<Buffer>;

export function wrapVectorStoreWithDualContentDecode(
  store: VectorStoreClient,
  orgId: string,
  getOrCreatePiiDek: GetOrCreatePiiDek,
): VectorStoreClient {
  return {
    similaritySearch: async (query: string, k: number, filter?: object) => {
      const results = await store.similaritySearch(query, k, filter);
      return decodeDualContentChunks(results, orgId, getOrCreatePiiDek);
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
  getOrCreatePiiDek: GetOrCreatePiiDek,
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
        'decodeDualContentChunks: failed to decrypt content_original, falling back to masked content',
        { err, orgId },
      );
      return chunk;
    }
  });
}
