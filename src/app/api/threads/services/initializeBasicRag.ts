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
import { Sentry } from 'pino-sentry';
import { logger } from '@/app/lib/utils/logger';

const serviceName = 'initializeBasicRag';

type InitializeRagChainParams = {
  orgId: string;
  settings: OrganizationSettings;
};

const DEFAULT_REPHRASE_MODEL = 'gpt-4o';
const DEFAULT_REPHRASE_TEMPERATURE = 0.5;

export const initializeRagChain = ({
  orgId,
  settings,
}: InitializeRagChainParams) => {
  try {
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(orgId);

    const {
      apiKey,
      model: answerModel,
      temperature: answerTemperature,
      prompt: answerInstructions,
      maxDocumentsToRetrieve,
    } = settings;

    setSentryContext('EXTRA_DATA', {
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
      orgId,
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
    Sentry.captureException(error);
    logger.error('Error initializing basic RAG chain: %o', error);
    throw error;
  }
};

const createVectorStore = (
  orgId: string,
  client: SupabaseClient,
  embeddingModel: Embeddings
): SupabaseVectorStore => {
  try {
    setSentryServiceTag(serviceName);
    setSentryClerkOrganizationTag(orgId);

    const metadataFilter: VectorStoreMetadataFilter = {
      organization_id: orgId.toLowerCase(),
    };

    return new SupabaseVectorStore(embeddingModel, {
      client,
      queryName: DOCUMENT_SEARCH_QUERY_NAME,
      filter: metadataFilter,
    });
  } catch (error) {
    Sentry.captureException(error);
    logger.error('Error creating vector store: %o', error);
    throw error;
  }
};
