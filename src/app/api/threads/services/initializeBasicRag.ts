import { auth } from '@clerk/nextjs/server';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { VectorStoreMetadataFilter } from '@/app/lib/types/types';
import { OrganizationSettings } from '@/app/lib/types/settings';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { DOCUMENT_SEARCH_QUERY_NAME } from '@/libs/db/constants/vectorStore';
import { Embeddings } from '@langchain/core/embeddings';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  createChatCompletionInstance,
  createModerationInstance,
  createEmbeddingsInstance,
} from '../../../lib/services/llm';
import {
  setSentryClerkOrganizationTag,
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';
import { QdrantVectorStore } from '@langchain/qdrant';
import { getOrganizationMetadata } from '@/app/actions';

const serviceName = 'initializeBasicRag';

type InitializeRagChainParams = {
  settings: OrganizationSettings;
};

const DEFAULT_REPHRASE_MODEL = 'gpt-4o';
const DEFAULT_REPHRASE_TEMPERATURE = 0.5;

export const initializeRagChain = async ({
  settings,
}: InitializeRagChainParams) => {
  try {
    const { orgId } = auth();
    setSentryServiceTag(serviceName);

    if (!orgId) {
      throw new Error('Invalid organization');
    }

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

    const orgMetadata = await getOrganizationMetadata(orgId);
    let vectorStore = undefined;

    if (orgMetadata.privateMetadata?.vector_store === 'qdrant') {
      vectorStore = await createQdrantVectorStore(embeddingModel);
    } else {
      vectorStore = createSupabaseVectorStore(
        supabaseVectorStoreClient,
        embeddingModel
      );
    }

    return await basicRagChain({
      models: {
        contentModerator,
        questionRephraser,
        answerGenerator,
      },
      config: {
        maxDocumentsToRetrieve,
        answerInstructions,
      },
      vectorStore,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error initializing basic RAG chain');
    throw error;
  }
};

const createQdrantVectorStore = async (embeddingModel: Embeddings) => {
  try {
    const { orgId } = auth();
    if (!orgId) {
      throw new Error('Organization ID is required, could not get from clerk');
    }

    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddingModel,
      {
        url: process.env.QDRANT_URL,
        apiKey: process.env.QDRANT_API_KEY, // staging and prod
        collectionName: orgId,
      }
    );

    return vectorStore;
  } catch (error) {
    logger.error({ err: error }, 'Error creating Qdrant vector store');
    throw error;
  }
};

// TODO: refactor to use with qdrant or switch depending on organization settings?
const createSupabaseVectorStore = (
  client: SupabaseClient,
  embeddingModel: Embeddings
): SupabaseVectorStore => {
  try {
    const { orgId } = auth();
    if (!orgId) {
      throw new Error('Organization ID is required, could not get from clerk');
    }

    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(orgId);

    // SECURITY CRITICAL: This organization_id filter is the primary security boundary
    // that prevents unauthorized access to documents across different organizations.
    // Removing or modifying this filter could lead to data leakage between organizations
    // and allow unauthorized access to sensitive documentation.
    const metadataFilter: VectorStoreMetadataFilter = {
      organization_id: orgId,
    };

    return new SupabaseVectorStore(embeddingModel, {
      client,
      queryName: DOCUMENT_SEARCH_QUERY_NAME,
      filter: metadataFilter,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating subabase vector store');
    throw error;
  }
};
