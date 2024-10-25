import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { VectorStoreMetadataFilter } from '@/app/lib/types/types';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { DOCUMENT_SEARCH_QUERY_NAME } from '@/libs/db/constants/vectorStore';
import { Embeddings } from '@langchain/core/embeddings';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  createChatCompletionInstance,
  createModerationInstance,
  createEmbeddingsInstance,
} from '../../../lib/services/llm';

const createVectorStore = (
  orgId: string,
  client: SupabaseClient,
  embeddingModel: Embeddings
): SupabaseVectorStore => {
  const metadataFilter: VectorStoreMetadataFilter = {
    organization_id: orgId.toLowerCase(),
  };

  return new SupabaseVectorStore(embeddingModel, {
    client,
    queryName: DOCUMENT_SEARCH_QUERY_NAME,
    filter: metadataFilter,
  });
};

const modelParams = {
  answer: {
    modelName: 'gpt-4o',
    temperature: 0.7,
  },

  standaloneQuestion: {
    modelName: 'gpt-4o',
    temperature: 0.5,
  },
};

export const initializeRagChain = (orgId: string, llmApiKey: string) => {
  const embeddigModel = createEmbeddingsInstance({ apiKey: llmApiKey });
  const contentModerator = createModerationInstance({ apiKey: llmApiKey });

  const questionRephraser = createChatCompletionInstance({
    apiKey: llmApiKey,
    ...modelParams.standaloneQuestion,
  });
  const answerGenerator = createChatCompletionInstance({
    apiKey: llmApiKey,
    ...modelParams.answer,
  });

  const vectorStore = createVectorStore(
    orgId,
    supabaseVectorStoreClient,
    embeddigModel
  );

  return basicRagChain({
    models: {
      contentModerator,
      questionRephraser,
      answerGenerator,
    },
    vectorStore,
  });
};
