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

const serviceName = 'initializeBasicRag';

type InitializeRagChainParams = {
  settings: OrganizationSettings;
};

const DEFAULT_REPHRASE_MODEL = 'gpt-4o';
const DEFAULT_REPHRASE_TEMPERATURE = 0.5;

export const initializeRagChain = ({ settings }: InitializeRagChainParams) => {
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

    const vectorStore = createVectorStore(
      supabaseVectorStoreClient,
      embeddingModel
    );

    return basicRagChain({
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

const createVectorStore = (
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
      organization_id: orgId.toLowerCase(),
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
