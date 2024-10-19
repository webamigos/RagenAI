import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import {
  SupabaseFilter,
  SupabaseVectorStore,
} from '@langchain/community/vectorstores/supabase';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

import { createChatInstance, embeddingModel } from './services/ChatService';
import { getAssistantPrompt } from '@/app/lib/services/settings';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import {
  DOCUMENT_SEARCH_QUERY_NAME,
  ORGANIZATION_DOCUMENTS_LIMIT,
} from '@/app/constants/vectorStore';
import db from '@salesyy/prisma-client';

type Document = {
  pageContent: string;
  metadata: Record<string, any>;
  id?: number | string;
};

//TODO: fix types
let chain: any;
//

async function getOrganizationDocuments(orgId: string) {
  return await db.usersDocuments.findMany({
    where: { organization_id: { equals: orgId, mode: 'insensitive' } },
    select: { file_name: true },
    take: ORGANIZATION_DOCUMENTS_LIMIT,
  });
}

function createVectorStore(organizationDocuments: { file_name: string }[]) {
  const filteringFunction = (rpc: SupabaseFilter) =>
    rpc.in(
      'metadata->>document_id',
      organizationDocuments.map((doc) => doc.file_name)
    );

  return new SupabaseVectorStore(embeddingModel, {
    client: supabaseVectorStoreClient,
    queryName: DOCUMENT_SEARCH_QUERY_NAME,
    filter: filteringFunction,
  });
}

async function initializeChain(request: NextRequest) {
  const { orgId } = getAuth(request);
  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const organizationDocuments = await getOrganizationDocuments(orgId);
  const vectorStore = createVectorStore(organizationDocuments);
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
