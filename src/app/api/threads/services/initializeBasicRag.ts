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
import { getThreadDetails } from '@/app/lib/services/thread';

const serviceName = 'initializeBasicRag';

type InitializeRagChainParams = {
  settings: OrganizationSettings;
  threadId?: string;
  projectInstruction?: string | null;
};

const DEFAULT_REPHRASE_MODEL = 'gpt-4o';
const DEFAULT_REPHRASE_TEMPERATURE = 0.5;

export const initializeRagChain = async ({
  settings,
  threadId,
  projectInstruction,
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
      hasProjectInstruction: !!projectInstruction,
    });

    // Combine org prompt with project instruction if available
    let finalInstructions = answerInstructions || '';
    if (projectInstruction) {
      finalInstructions = `${finalInstructions}\n\n<project_instructions>\n${projectInstruction}\n</project_instructions>`;
    }

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
      vectorStore = await createQdrantVectorStore(embeddingModel, threadId);
    } else {
      vectorStore = await createSupabaseVectorStore(
        supabaseVectorStoreClient,
        embeddingModel,
        threadId
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
  threadId?: string
) => {
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
const createSupabaseVectorStore = async (
  client: SupabaseClient,
  embeddingModel: Embeddings,
  threadId?: string
): Promise<SupabaseVectorStore> => {
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

    // Add project_id to the filter if the thread belongs to a project
    if (threadId) {
      try {
        const thread = await getThreadDetails(threadId);

        if (thread.project_id) {
          metadataFilter.project_id = thread.project_id;
        }
      } catch (error) {
        logger.error(
          { err: error },
          `Error getting thread details for project filtering: ${threadId}`
        );
      }
    }

    return new SupabaseVectorStore(embeddingModel, {
      client,
      queryName: DOCUMENT_SEARCH_QUERY_NAME,
      filter: metadataFilter,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating supabase vector store');
    throw error;
  }
};
