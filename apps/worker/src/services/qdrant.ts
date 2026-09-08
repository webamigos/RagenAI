import { embedMany } from 'ai';
import { v4 as uuidv4 } from 'uuid';

import { type Document } from '../types/Document';
import { getEmbeddingModelForOrg } from './llm';
import { withLangfuseTrace } from './langfuse-trace';
import { EMBEDDINGS_MODEL } from '../consts';
import { logger } from './logger';
import {
  encode as encodeBm25,
  type SparseVector,
  BATCH_SIZE,
  VECTOR_SIZE,
  DENSE_VECTOR_NAME,
  SPARSE_VECTOR_NAME,
  prepareEmbeddingBatches,
} from '@ragenai/rag-core';
import { db } from './db/db';
import { decryptContent } from '@ragenai/crypto';
import { getKeyProvider, isEncryptionConfigured } from '@ragenai/crypto';

const verifiedCollections = new Set<string>();
const pendingCollections = new Map<string, Promise<void>>();

let client: any = null;
let clientPromise: Promise<any> | null = null;

async function getClient() {
  if (client) return client;
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const { QdrantClient } = await import('@qdrant/js-client-rest');
    const instance = new QdrantClient({
      url: process.env.QDRANT_URL || 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
    });
    client = instance;
    return instance;
  })();

  return clientPromise;
}

async function ensureCollection(collectionName: string): Promise<void> {
  if (verifiedCollections.has(collectionName)) return;

  const pending = pendingCollections.get(collectionName);
  if (pending) return pending;

  const promise = doEnsureCollection(collectionName);
  pendingCollections.set(collectionName, promise);

  try {
    await promise;
  } finally {
    pendingCollections.delete(collectionName);
  }
}

async function doEnsureCollection(collectionName: string): Promise<void> {
  const qdrant = await getClient();
  const exists = await qdrant.collectionExists(collectionName);

  if (!exists.exists) {
    await qdrant.createCollection(collectionName, {
      vectors: {
        [DENSE_VECTOR_NAME]: {
          size: VECTOR_SIZE,
          distance: 'Cosine',
        },
      },
      sparse_vectors: {
        [SPARSE_VECTOR_NAME]: {
          // Qdrant computes IDF from stored term frequencies and scores
          // BM25-style at query time.
          modifier: 'idf',
        },
      },
      optimizers_config: { indexing_threshold: 20000 },
    });

    const indexFields = [
      'metadata.project_id',
      'metadata.file_id',
      'metadata.organization_id',
      'metadata.accessible_by',
    ];
    for (const field of indexFields) {
      await qdrant.createPayloadIndex(collectionName, {
        field_name: field,
        field_schema: 'keyword',
      });
    }

    logger.info(
      { collection: collectionName },
      'Qdrant collection created with hybrid dense+sparse vectors',
    );
  }

  verifiedCollections.add(collectionName);
}

const addDocuments = async ({
  orgId,
  projectId,
  userId,
  docs,
}: {
  orgId: string;
  projectId?: string | null;
  userId?: string | null;
  docs: Document[];
}): Promise<{ inputTokens: number }> => {
  if (docs.length === 0) {
    return { inputTokens: 0 };
  }

  const qdrant = await getClient();
  await ensureCollection(orgId);

  // For dual_content docs: embed on the original (decrypted) text for better recall.
  // content_original is stored encrypted in metadata; decrypt once per batch.
  let piiDek: Buffer | null = null;
  const hasDualContent = docs.some(
    (d) =>
      d.metadata?.pii_mode === 'dual_content' &&
      typeof d.metadata?.content_original === 'string',
  );
  if (hasDualContent && isEncryptionConfigured()) {
    const encryptedDek = await db.getEncryptedPiiDek(orgId);
    if (encryptedDek) {
      piiDek = await getKeyProvider().decryptDataKey(encryptedDek);
    }
  }

  const texts = docs.map((d) => {
    let text = d.pageContent;
    if (
      piiDek &&
      d.metadata?.pii_mode === 'dual_content' &&
      typeof d.metadata?.content_original === 'string'
    ) {
      try {
        text = decryptContent(d.metadata.content_original, piiDek);
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), orgId },
          'qdrant.addDocuments: failed to decrypt content_original for embedding — using masked text',
        );
      }
    }
    return text;
  });
  const model = await getEmbeddingModelForOrg(orgId, EMBEDDINGS_MODEL);

  // Truncation and batch size come from @ragenai/rag-core so the write side
  // cannot drift from the read side — see embedding-contract.ts.
  const batches = prepareEmbeddingBatches(texts, {
    onTruncate: ({ originalLength, maxLength }) =>
      logger.warn(
        { orgId, originalLength, maxLength },
        'Truncating oversized chunk for embedding',
      ),
  });

  const startedAt = Date.now();
  const embeddings: number[][] = [];
  let totalTokens = 0;
  for (const batchTexts of batches) {
    const { embeddings: batchEmbeddings, usage } = await withLangfuseTrace(
      {
        name: 'embed-documents',
        sessionId: orgId,
        tags: ['embedding', EMBEDDINGS_MODEL],
      },
      () =>
        embedMany({
          model,
          values: batchTexts,
          experimental_telemetry: { isEnabled: true },
        }),
    );
    embeddings.push(...batchEmbeddings);
    totalTokens += usage.tokens;
  }

  await db.trackAiUsage({
    organizationId: orgId,
    projectId: projectId ?? null,
    userId: userId ?? null,
    step: 'EMBEDDINGS',
    provider: 'litellm',
    model: EMBEDDINGS_MODEL,
    inputTokens: totalTokens,
    outputTokens: 0,
    totalTokens,
    durationMs: Date.now() - startedAt,
  });

  const points = docs.map((doc, i) => {
    const sparse = encodeBm25(doc.pageContent);
    const vector: Record<string, number[] | SparseVector> = {
      [DENSE_VECTOR_NAME]: embeddings[i],
    };
    // Skip the sparse component for chunks with no tokenizable content
    // (e.g. numbers/punctuation only). Qdrant accepts partial named vectors.
    if (sparse.indices.length > 0) {
      vector[SPARSE_VECTOR_NAME] = sparse;
    }
    return {
      id: uuidv4(),
      vector,
      payload: {
        content: doc.pageContent,
        pageContent: doc.pageContent,
        metadata: doc.metadata,
      },
    };
  });

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await qdrant.upsert(orgId, { points: batch, wait: true });
  }

  logger.info(
    { count: docs.length, collection: orgId },
    'Documents added to Qdrant (hybrid: dense + sparse)',
  );

  return { inputTokens: totalTokens };
};

/**
 * Remove every chunk belonging to one file from an organization's collection.
 *
 * Point ids are random uuids, so an upsert can never replace a previous
 * ingest — without this, re-embedding a document leaves the old version's
 * chunks in the index next to the new ones, and retrieval happily cites text
 * the user has already rolled back.
 */
const deleteByFileId = async ({
  orgId,
  fileId,
}: {
  orgId: string;
  fileId: string;
}): Promise<void> => {
  const qdrant = await getClient();
  await ensureCollection(orgId);

  await qdrant.delete(orgId, {
    filter: { must: [{ key: 'metadata.file_id', match: { value: fileId } }] },
    wait: true,
  });

  logger.info({ fileId, collection: orgId }, 'Deleted file chunks from Qdrant');
};

export const qdrantService = { addDocuments, deleteByFileId };
