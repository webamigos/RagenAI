import { getAuth } from '@clerk/nextjs/server';
import {
  SupabaseFilterRPCCall,
  SupabaseVectorStore,
} from '@langchain/community/vectorstores/supabase';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';

import {
  createChatInstance,
  embeddingModel,
  supaBaseClient,
} from './services/ChatService';
import { NextRequest } from 'next/server';
import db from '@salesyy/prisma-client';
import { DOCUMENT_SEARCH_QUERY_NAME } from '@/app/constants/vectorStore';
import { ThreadConversationPrompts } from './constants/prompts';
import { CHAIN_FINAL_ANSWER_RUN_NAME } from './constants/chainConfig';

type Document = {
  pageContent: string;
  metadata: Record<string, any>;
  id?: number | string;
};

function combineDocuments(docs: Document[]) {
  return docs.map((doc) => doc.pageContent).join('\n\n');
}

//Todo:
//utilise prompt from getAssistantPrompt user settings
async function initializeChainV2(request: NextRequest) {
  const { orgId } = getAuth(request);
  if (!orgId) {
    throw new Error('Unauthorized');
  }

  const organizationDocuments = await db.usersDocuments.findMany({
    where: { organization_id: { equals: orgId, mode: 'insensitive' } },
    select: { file_name: true },
  });

  const documentIdFilteringFunction: SupabaseFilterRPCCall = (rpc) =>
    rpc.in(
      'metadata->>document_id',
      organizationDocuments.map((doc) => doc.file_name)
    );

  //Retreival chain
  const vectorStore = new SupabaseVectorStore(embeddingModel, {
    client: supaBaseClient,
    queryName: DOCUMENT_SEARCH_QUERY_NAME,
    filter: documentIdFilteringFunction,
  });

  const documentRetrievalChain = RunnableSequence.from([
    (input) => input.standalone_question,
    vectorStore.asRetriever(),
    combineDocuments,
  ]);

  // Standalone question chain
  const rephraseQuestionChainPrompt = ChatPromptTemplate.fromMessages([
    ['system', ThreadConversationPrompts.systemTemplates.rephraseQuestion],
    new MessagesPlaceholder('chat_history'),
    ['human', ThreadConversationPrompts.humanTemplates.rephraseQuestion],
  ]);

  const rephraseQuestionChain = RunnableSequence.from([
    rephraseQuestionChainPrompt,
    () => createChatInstance(request),
    new StringOutputParser(),
  ]);

  // Answer generation chain
  const answerGenerationChainPrompt = ChatPromptTemplate.fromMessages([
    ['system', ThreadConversationPrompts.systemTemplates.answerChain],
    new MessagesPlaceholder('chat_history'),
    ['human', ThreadConversationPrompts.humanTemplates.answerChain],
  ]);

  // main retrieval chain
  return RunnableSequence.from([
    RunnablePassthrough.assign({
      standalone_question: rephraseQuestionChain,
    }),
    RunnablePassthrough.assign({
      context: documentRetrievalChain,
    }),
    answerGenerationChainPrompt,

    () => createChatInstance(request),
    new StringOutputParser().withConfig({
      runName: CHAIN_FINAL_ANSWER_RUN_NAME,
    }),
  ]);
}

export { initializeChainV2 };
