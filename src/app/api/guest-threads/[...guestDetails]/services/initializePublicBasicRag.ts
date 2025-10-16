import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { QdrantVectorStore } from '@langchain/qdrant';

import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { VectorStoreMetadataFilter } from '@/app/lib/types/types';
import { OrganizationSettings } from '@/app/lib/types/settings';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { DOCUMENT_SEARCH_QUERY_NAME } from '@/libs/db/constants/vectorStore';
import { Embeddings } from '@langchain/core/embeddings';
import { SupabaseClient } from '@supabase/supabase-js';
import { VectorStore } from '@langchain/core/vectorstores';

import {
  setSentryClerkOrganizationTag,
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';
import {
  createChatCompletionInstance,
  createEmbeddingsInstance,
  createModerationInstance,
} from '@/app/lib/services/llm';
import { getOrganizationMetadata } from '@/app/actions';

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
    setSentryServiceTag(serviceName);

    const {
      apiKey,
      model: answerModel,
      temperature: answerTemperature,
      prompt: answerInstructions,
      maxDocumentsToRetrieve,
    } = settings;

    setSentryContext('CHAIN_DATA', {
      answerModel,
      answerTemperature,
      answerInstructions,
      maxDocumentsToRetrieve,
      hasProjectInstruction: !!projectInstruction,
    });

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
    let vectorStore: VectorStore | undefined = undefined;

    if (orgMetadata.privateMetadata?.vector_store === 'qdrant') {
      vectorStore = await createQdrantVectorStore(
        embeddingModel,
        organizationId
      );
    } else {
      vectorStore = createSupabaseVectorStore(
        supabaseVectorStoreClient,
        embeddingModel,
        organizationId
      );
    }

    if (typeof vectorStore === 'undefined') {
      logger.error('Error initializing basic RAG chain');
      throw new Error(
        'Cannot determine VectorStore - use one of Supabase or Qdrant'
      );
    }

    // Combine org prompt with project instruction if available
    let finalInstructions = answerInstructions || '';
    if (projectInstruction) {
      finalInstructions = `${finalInstructions}\n\n<project_instructions>\n${projectInstruction}\n</project_instructions>`;
    }
    const isSupabaseVectorStore = vectorStore instanceof SupabaseVectorStore;

    // Configure metadata filter for project-level access control
    const metadataFilter = {
      must: [
        {
          key: 'metadata.project_id',
          match: {
            value: projectId,
          },
        },
      ],
    };

    return await basicRagChain({
      models: {
        contentModerator,
        questionRephraser,
        answerGenerator,
        embeddings: embeddingModel,
      },
      config: {
        metadataFilter: isSupabaseVectorStore ? {} : metadataFilter,
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

const createQdrantVectorStore = async (
  embeddingModel: Embeddings,
  organizationId: string
) => {
  logger.info('creating qdrant vector store', {
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY, // staging and prod
    collectionName: organizationId,
  });
  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddingModel,
    {
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY, // staging and prod
      collectionName: organizationId,
    }
  );

  return vectorStore;
};

const createSupabaseVectorStore = (
  client: SupabaseClient,
  embeddingModel: Embeddings,
  organizationId: string
): SupabaseVectorStore => {
  try {
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(organizationId);

    // SECURITY CRITICAL: This organization_id filter is the primary security boundary
    // that prevents unauthorized access to documents across different organizations.
    // Removing or modifying this filter could lead to data leakage between organizations
    // and allow unauthorized access to sensitive documentation.
    const metadataFilter: VectorStoreMetadataFilter = {
      organization_id: organizationId,
    };

    return new SupabaseVectorStore(embeddingModel, {
      client,
      queryName: DOCUMENT_SEARCH_QUERY_NAME,
      filter: metadataFilter,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating vector store');
    throw error;
  }
};
