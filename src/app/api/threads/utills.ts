import { getAuth } from '@clerk/nextjs/server';
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

import {
  createChatInstance,
  embeddingModel,
  supaBaseClient,
} from './services/ChatService';
import { getAssistantPrompt } from '@/app/lib/services/settings';
import { NextRequest, NextResponse } from 'next/server';

type Document = {
  pageContent: string;
  metadata: Record<string, any>;
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

  const vectorStore = new SupabaseVectorStore(embeddingModel, {
    client: supaBaseClient,
    tableName: `documents_${orgId}`,
    queryName: 'match_documents',
  });

  const retriever = vectorStore.asRetriever();
  const retrieverChain = RunnableSequence.from([
    (prevResult) => prevResult.question,
    retriever,
    combineDocuments,
  ]);

  const prompt = (await getAssistantPrompt(orgId)) as string;
  const promptTemplate = PromptTemplate.fromTemplate(prompt);

  chain = RunnableSequence.from([
    {
      question: (input) => input.question,
      chat_history: (input) => input.chat_history,
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
