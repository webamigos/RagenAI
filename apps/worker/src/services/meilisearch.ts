import { embedMany } from 'ai';
import { v4 as uuidv4 } from 'uuid';

import { Document } from '../types/Document';
import { getEmbeddingModelForOrg } from './llm';
import { withLangfuseTrace } from './langfuse-trace';
import { EMBEDDINGS_MODEL } from '../consts';

// Bedrock Cohere embed caps at 96 texts per request; larger batches trigger
// "Invalid parameter combination". See qdrant.ts for the same constant.
const EMBED_BATCH_SIZE = 96;

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
      custom: {
        source: 'userProvided',
        dimensions: 1024,
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
  const embeddings: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batchTexts = texts.slice(i, i + EMBED_BATCH_SIZE);
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
