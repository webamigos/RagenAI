import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

import { createChatInstance, embeddingModel } from './services/ChatService';
import { getAssistantPrompt } from '@/app/lib/services/settings';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { DOCUMENT_SEARCH_QUERY_NAME } from '@/app/constants/vectorStore';
import {
  VectorStoreDocumentMetadata,
  VectorStoreMetadataFilter,
} from '@/app/lib/types/types';

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

export { initializeChain, chain };
