import { getAuth } from '@clerk/nextjs/server';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { NextRequest, NextResponse } from 'next/server';

import { getAssistantPrompt } from '@/app/lib/services/settings';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { createChatInstance, embeddingModel } from './services/ChatService';

import {
  VectorStoreDocumentMetadata,
  VectorStoreMetadataFilter,
} from '@/app/lib/types/types';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { DOCUMENT_SEARCH_QUERY_NAME } from '@/libs/db/constants/vectorStore';
import { Embeddings } from '@langchain/core/embeddings';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  createChatCompletionInstance,
  createModerationInstance,
  createEmbeddingsInstance,
} from './services/llm';

type Document = {
  pageContent: string;
  metadata: VectorStoreDocumentMetadata;
  id?: number | string;
};

//TODO: fix types
let chain: any;
//

async function initializeChain(request: NextRequest) {
  const { orgId } = getAuth(request);
  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const metadataFilter: VectorStoreMetadataFilter = {
    organization_id: orgId.toLowerCase(),
  };

  const vectorStore = new SupabaseVectorStore(embeddingModel, {
    client: supabaseVectorStoreClient,
    queryName: DOCUMENT_SEARCH_QUERY_NAME,
    filter: metadataFilter,
  });

  const retriever = vectorStore.asRetriever();

  const retrieverChain = RunnableSequence.from([
    (prevResult) => prevResult.question,
    retriever,
    combineDocuments,
  ]);

  const prompt = (await getAssistantPrompt(orgId)) ?? '';
  const promptTemplate = PromptTemplate.fromTemplate(prompt);

  chain = RunnableSequence.from([
    {
      question: (input) => input.question,
      chat_history: (input) => input.conv_history,
      context: () => retrieverChain,
    },
    promptTemplate,
    () => createChatInstance(request),
    new StringOutputParser(),
  ]);

  return chain;
}

function combineDocuments(docs: Document[]) {
  return docs.map((doc) => doc.pageContent).join('\n\n');
}

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

const initializeRagChain = (orgId: string, llmApiKey: string) => {
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

  const embeddigModel = createEmbeddingsInstance(llmApiKey);
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

export { chain, combineDocuments, initializeChain, initializeRagChain };
