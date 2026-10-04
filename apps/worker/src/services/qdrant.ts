import { embedMany } from 'ai';
import { v4 as uuidv4 } from 'uuid';

import { type Document } from '../types/Document.js';
import { getEmbeddingModelForOrg } from './llm/index.js';
import { withLangfuseTrace } from './langfuse-trace.js';
import { EMBEDDINGS_MODEL } from '../consts.js';
import { logger } from './logger.js';
import {
  encode as encodeBm25,
  type SparseVector,
  BATCH_SIZE,
  VECTOR_SIZE,
  DENSE_VECTOR_NAME,
  SPARSE_VECTOR_NAME,
  CONTEXT_PREFIX_IN_BM25,
  embeddingTextFor,
  PAYLOAD_INDEXES,
  prepareEmbeddingBatches,
} from '@ragenai/rag-core';
import { db } from './db/db.js';
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

    logger.info(
      { collection: collectionName },
      'Qdrant collection created with hybrid dense+sparse vectors',
    );
  }

  await ensurePayloadIndexes(qdrant, collectionName);
  verifiedCollections.add(collectionName);
}

/**
 * Create whichever of `PAYLOAD_INDEXES` the collection lacks, and say which.
 *
 * Indexes used to be created only with the collection, so one added to the
 * list later never reached a collection that already existed. Reading the
 * collection's `payload_schema` first makes this safe to run on every
 * collection, every time: an index that exists is left alone.
 */
export async function ensurePayloadIndexes(
  qdrant: {
    getCollection: (name: string) => Promise<{
      payload_schema?: Record<string, unknown>;
    }>;
    createPayloadIndex: (
      name: string,
      index: { field_name: string; field_schema: 'keyword' | 'integer' },
    ) => Promise<unknown>;
  },
  collectionName: string,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<string[]> {
  const info = await qdrant.getCollection(collectionName);
  const existing = new Set(Object.keys(info.payload_schema ?? {}));
  const missing = PAYLOAD_INDEXES.filter(({ field }) => !existing.has(field));
  if (!dryRun) {
    for (const { field, schema } of missing) {
      await qdrant.createPayloadIndex(collectionName, {
        field_name: field,
        field_schema: schema,
      });
    }
    if (missing.length > 0) {
      logger.info(
        { collection: collectionName, fields: missing.map((m) => m.field) },
        'Qdrant payload indexes created',
      );
    }
  }
  return missing.map((m) => m.field);
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
    const prefix =
      typeof d.metadata?.context_prefix === 'string'
        ? d.metadata.context_prefix
        : undefined;
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
    // The context prefix (spec 2026-09-29-contextual-chunks) is embedded in
    // front of the chunk and stored beside it; `pageContent` stays the chunk.
    return embeddingTextFor(text, prefix);
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
    const prefix =
      typeof doc.metadata?.context_prefix === 'string'
        ? doc.metadata.context_prefix
        : undefined;
    const sparse = encodeBm25(
      CONTEXT_PREFIX_IN_BM25
        ? embeddingTextFor(doc.pageContent, prefix)
        : doc.pageContent,
    );
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

/**
 * Remove a published Brain page's chunks by publication generation
 * (`metadata.brain_generation`), so one publish run never deletes another's.
 *
 * - `only`: exactly this generation's chunks — a run that lost the race
 *   taking back what it wrote, and nothing a newer run wrote after it.
 * - `upTo`: this generation's and every older one's, plus chunks with no
 *   generation at all (written before the stamp existed) — a run clearing
 *   the way before it writes, leaving a newer run's chunks alone.
 */
const deleteBrainChunks = async ({
  orgId,
  fileId,
  generation,
  scope,
}: {
  orgId: string;
  fileId: string;
  generation: number;
  scope: 'only' | 'upTo';
}): Promise<void> => {
  const qdrant = await getClient();
  await ensureCollection(orgId);
  const byFile = { key: 'metadata.file_id', match: { value: fileId } };
  const filter =
    scope === 'only'
      ? {
          must: [
            byFile,
            { key: 'metadata.brain_generation', match: { value: generation } },
          ],
        }
      : {
          must: [byFile],
          must_not: [
            { key: 'metadata.brain_generation', range: { gt: generation } },
          ],
        };
  await qdrant.delete(orgId, { filter, wait: true });
  logger.info(
    { fileId, collection: orgId, generation, scope },
    'Deleted Brain page chunks from Qdrant',
  );
};

/**
 * Rewrite `metadata.accessible_by` on a file's points, leaving the points
 * themselves alone.
 *
 * Two details are load-bearing, and the first one was wrong in the code this
 * replaces:
 *
 * - `key: 'metadata'` with a payload of `{ accessible_by }`. A payload keyed
 *   `'metadata.accessible_by'` is not a path: Qdrant stores it as a literal
 *   top-level key with a dot in its name, the retrieval filter never reads it,
 *   and the call reports success while changing nothing that matters.
 * - Points that carry `brain_generation` are skipped. A published Brain page
 *   is chunked under its own file id, and its access comes from the page's
 *   `accessibleBy`, which `brainPublishPage` rewrites by clearing and
 *   re-publishing. Deriving it from the file row here would overwrite it.
 *
 * A file with no points matches nothing and is not an error, which is what
 * makes it safe to run against a file that is still being ingested.
 */
const setFileAccess = async ({
  orgId,
  fileId,
  accessibleBy,
}: {
  orgId: string;
  fileId: string;
  accessibleBy: string[];
}): Promise<void> => {
  const qdrant = await getClient();
  await ensureCollection(orgId);

  await qdrant.setPayload(orgId, {
    payload: { accessible_by: accessibleBy },
    key: 'metadata',
    filter: {
      must: [
        { key: 'metadata.file_id', match: { value: fileId } },
        { is_empty: { key: 'metadata.brain_generation' } },
      ],
    },
    wait: true,
  });

  logger.info(
    { fileId, collection: orgId, principals: accessibleBy.length },
    'Rewrote accessible_by on file chunks in Qdrant',
  );
};

export const qdrantService = {
  addDocuments,
  deleteByFileId,
  setFileAccess,
  deleteBrainChunks,
};
