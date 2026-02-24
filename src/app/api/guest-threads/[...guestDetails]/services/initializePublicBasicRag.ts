import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { OrganizationSettings } from '@/app/lib/types/settings';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { DOCUMENT_SEARCH_QUERY_NAME } from '@/libs/db/constants/vectorStore';
import type { VectorStoreClient } from '@/libs/vector-store/types';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';
import type { SupabaseClient } from '@supabase/supabase-js';

import { logger } from '@/app/lib/utils/logger';
import {
  createChatCompletionInstance,
  createEmbeddingsInstance,
  createModerationInstance,
} from '@/app/lib/services/llm';
import { getOrganizationMetadata } from '@/app/actions';
import { MeilisearchVectorStoreClient } from '@/libs/vector-store/meilisearch-client';
import { SupabaseVectorStoreClient } from '@/libs/vector-store/supabase-client';

const serviceName = 'initializeBasicRag';

type InitializePublicRagChainParams = {
  settings: OrganizationSettings;
  organizationId: string;
  projectInstruction?: string | null;
  projectId?: number;
};

const DEFAULT_REPHRASE_MODEL = 'gpt-4o';
const DEFAULT_REPHRASE_TEMPERATURE = 0.5;

export const initializePublicRagChain = async ({
  settings,
  organizationId,
  projectInstruction,
  projectId,
}: InitializePublicRagChainParams) => {
  try {
    const {
      apiKey,
      model: answerModel,
      temperature: answerTemperature,
      prompt: answerInstructions,
      maxDocumentsToRetrieve,
    } = settings;

    const embeddingModel = createEmbeddingsInstance({ apiKey });
    const contentModerator = createModerationInstance({ apiKey });

    const questionRephraser = createChatCompletionInstance({
      apiKey,
      model: DEFAULT_REPHRASE_MODEL,
      temperature: DEFAULT_REPHRASE_TEMPERATURE,
    });
    const answerGenerator = createChatCompletionInstance({
      apiKey,
      model: answerModel,
      temperature: answerTemperature,
    });

    const orgMetadata = await getOrganizationMetadata(organizationId);
    let vectorStore: VectorStoreClient;
    let isMeilisearch = false;

    if (orgMetadata.privateMetadata?.vector_store === 'meilisearch') {
      vectorStore = createMeilisearchVectorStore(
        embeddingModel,
        organizationId
      );
      isMeilisearch = true;
    } else {
      vectorStore = createSupabaseVectorStore(
        supabaseVectorStoreClient,
        embeddingModel,
        organizationId
      );
    }

    // Combine org prompt with project instruction if available
    let finalInstructions = answerInstructions || '';
    if (projectInstruction) {
      finalInstructions = `${finalInstructions}\n\n<project_instructions>\n${projectInstruction}\n</project_instructions>`;
    }

    // Configure metadata filter for project-level access control
    const metadataFilter = isMeilisearch
      ? {
          must: [
            {
              key: 'metadata.project_id',
              match: {
                value: projectId,
              },
            },
          ],
        }
      : {};

    return await basicRagChain({
      models: {
        contentModerator,
        questionRephraser,
        answerGenerator,
        embeddings: embeddingModel,
      },
      config: {
        metadataFilter: isMeilisearch ? metadataFilter : undefined,
        maxDocumentsToRetrieve,
        answerInstructions: finalInstructions,
      },
      vectorStore,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error initializing basic RAG chain');
    throw error;
  }
};

const createMeilisearchVectorStore = (
  embeddingModel: EmbeddingsProvider,
  indexName: string
): VectorStoreClient => {
  logger.info('creating meilisearch vector store', {
    url: process.env.MEILISEARCH_URL,
    indexName,
  });

  return new MeilisearchVectorStoreClient(embeddingModel, {
    url: process.env.MEILISEARCH_URL!,
    apiKey: process.env.MEILISEARCH_MASTER_KEY,
    indexName,
  });
};

const createSupabaseVectorStore = (
  client: SupabaseClient,
  embeddingModel: EmbeddingsProvider,
  organizationId: string
): VectorStoreClient => {
  try {
    // SECURITY CRITICAL: This organization_id filter is the primary security boundary
    // that prevents unauthorized access to documents across different organizations.
    // Removing or modifying this filter could lead to data leakage between organizations
    // and allow unauthorized access to sensitive documentation.
    const metadataFilter: Record<string, any> = {
      organization_id: organizationId,
    };

    return new SupabaseVectorStoreClient(embeddingModel, {
      client,
      queryName: DOCUMENT_SEARCH_QUERY_NAME,
      filter: metadataFilter,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating vector store');
    throw error;
  }
};
