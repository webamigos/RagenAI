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
import {
  getAssistantPrompt,
  getModel,
  getOpenaiAPIKey,
  getTemperatureSetting,
} from '@/app/lib/services/settings';

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

export const initializeRagChain = async (orgId: string) => {
  const {
    llmApiKey,
    model,
    temperature,
    answerInstructions,
    retreivalMaxDocuments,
  } = await fetchOrganizationSettings(orgId);

  if (!llmApiKey) {
    throw new Error('LLM API key is required.');
  }

  const modelParams = getModelParams({
    answerModel: model,
    answerTemperature: temperature,
  });

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
    config: {
      retreivalMaxDocuments,
      answerInstructions,
    },
    vectorStore,
  });
};

const fetchOrganizationSettings = async (orgId: string) => {
  const llmApiKey = await getOpenaiAPIKey(orgId);
  const model = await getModel(orgId);
  const temperature = await getTemperatureSetting(orgId);
  const answerInstructions = await getAssistantPrompt(orgId);
  const retreivalMaxDocuments = 3;

  return {
    llmApiKey,
    model,
    temperature,
    answerInstructions,
    retreivalMaxDocuments,
  };
};

const getModelParams = ({
  answerModel,
  answerTemperature,
}: {
  answerModel: string | null;
  answerTemperature: number;
}) => {
  return {
    answer: {
      modelName: answerModel ?? 'gpt-4o',
      temperature: answerTemperature ?? 1,
    },

    standaloneQuestion: {
      modelName: 'gpt-4o',
      temperature: 0.5,
    },
  };
};
