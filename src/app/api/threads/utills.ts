import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

import {
  createChatInstance,
  createChatInstanceV2,
  createModerationInstance,
  embeddingModel,
} from './services/ChatService';
import { getAssistantPrompt } from '@/app/lib/services/settings';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';

import {
  VectorStoreDocumentMetadata,
  VectorStoreMetadataFilter,
} from '@/app/lib/types/types';
import { basicRagChain } from '@/libs/chains/basic-rag/chain';
import { SupabaseClient } from '@supabase/supabase-js';
import { EmbeddingsInterface } from '@langchain/core/embeddings';
import { DOCUMENT_SEARCH_QUERY_NAME } from '@/libs/db/constants/vectorStore';

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

function zodUserInputValidator(input: string, maxLength: number) {
  const schema = z.object({
    question: z.string().min(1).max(maxLength),
  });

  return schema.parse({ question: input });
}

//Very naive implementation, consider using a more sophisticated approach like history summarization
function limitChatHistory(history: string | undefined, limit: number) {
  return history ? history.slice(-limit) : undefined;
}

const createVectorStore = (
  orgId: string,
  client: SupabaseClient,
  embeddingModel: EmbeddingsInterface
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

const initializeRagChain = (orgId: string) => {
  const vectorStore = createVectorStore(
    orgId,
    supabaseVectorStoreClient,
    embeddingModel
  );
  return basicRagChain({
    orgId,
    models: {
      embeddingModel,
      createModerationInstance,
      createChatInstance: createChatInstanceV2,
    },
    vectorStore,
  });
};

export {
  combineDocuments,
  zodUserInputValidator,
  limitChatHistory,
  chain,
  initializeChain,
  initializeRagChain,
};
