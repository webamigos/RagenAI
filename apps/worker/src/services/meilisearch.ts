import { embedMany } from 'ai';
import { v4 as uuidv4 } from 'uuid';

import { type Document } from '../types/Document';
import { getEmbeddingModelForOrg } from './llm';
import { withLangfuseTrace } from './langfuse-trace';
import { EMBEDDINGS_MODEL } from '../consts';
import { logger } from './logger';
import { prepareEmbeddingBatches, VECTOR_SIZE } from '@ragenai/rag-core';

const getClient = async () => {
  const { MeiliSearch } = await import('meilisearch');
  return new MeiliSearch({
    host: process.env.MEILISEARCH_URL!,
    apiKey: process.env.MEILISEARCH_API_KEY,
  });
};

const sanitizeIndexName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9_-]/g, '_');

const ensureIndex = async (
  client: Awaited<ReturnType<typeof getClient>>,
  indexName: string,
) => {
  const index = client.index(indexName);

  try {
    await index.getRawInfo();
  } catch {
    try {
      await client.createIndex(indexName, { primaryKey: 'id' });
    } catch (error: unknown) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'index_already_exists'
      )) {
        throw error;
      }
    }
  }

  await client.index(indexName).updateSettings({
    embedders: {
      // From the shared contract, not a literal: this was hard-coded to 1024
      // while VECTOR_SIZE defaulted to 3584, so Meilisearch was configured to
      // expect vectors a different size than the embedding model produces.
      custom: {
        source: 'userProvided',
        dimensions: VECTOR_SIZE,
      },
    },
  });

  return index;
};

export type EmbeddingUsage = {
  inputTokens: number;
};

const addDocuments = async ({
  orgId,
  docs,
}: {
  orgId: string;
  docs: Document[];
}) => {
  if (docs.length === 0) {
    return { inputTokens: 0 };
  }

  const client = await getClient();
  const model = await getEmbeddingModelForOrg(orgId, EMBEDDINGS_MODEL);

  const texts = docs.map((d) => d.pageContent);

  // Shares the truncation and batch size with the Qdrant path. This branch
  // previously batched but never truncated, so an oversized chunk went to the
  // provider whole — the same document indexed here and in Qdrant could be
  // embedded from different text.
  const batches = prepareEmbeddingBatches(texts, {
    onTruncate: ({ originalLength, maxLength }) =>
      logger.warn(
        { orgId, originalLength, maxLength },
        'Truncating oversized chunk for embedding',
      ),
  });

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

  const indexName = sanitizeIndexName(orgId);
  const index = await ensureIndex(client, indexName);

  const documents = docs.map((doc, i) => ({
    id: uuidv4(),
    content: doc.pageContent,
    metadata: doc.metadata,
    _vectors: {
      custom: embeddings[i],
    },
  }));

  const task = await index.addDocuments(documents);
  await client.waitForTask(task.taskUid);

  return { inputTokens: totalTokens };
};

export const meilisearch = {
  addDocuments,
};
