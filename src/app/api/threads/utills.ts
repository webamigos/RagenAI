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
  const REPHRASE_QUESTION_SYSTEM_TEMPLATE = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.`;

  const rephraseQuestionChainPrompt = ChatPromptTemplate.fromMessages([
    ['system', REPHRASE_QUESTION_SYSTEM_TEMPLATE],
    new MessagesPlaceholder('chat_history'),
    [
      'human',
      'Rephrase the following question as a standalone question:\n{question}',
    ],
  ]);

  const rephraseQuestionChain = RunnableSequence.from([
    rephraseQuestionChainPrompt,
    () => createChatInstance(request),
    new StringOutputParser(),
  ]);

  // Answer generation chain
  const ANSWER_CHAIN_SYSTEM_TEMPLATE = `You are an experienced researcher, 
expert at interpreting and answering questions based on provided sources.
Using the below provided context and chat history, 
answer the user's question to the best of 
your ability 
using only the resources provided. Be verbose!

<context>
{context}
</context>`;

  const answerGenerationChainPrompt = ChatPromptTemplate.fromMessages([
    ['system', ANSWER_CHAIN_SYSTEM_TEMPLATE],
    new MessagesPlaceholder('chat_history'),
    [
      'human',
      'Now, answer this question using the previous context and chat history:\n{standalone_question}',
    ],
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
      runName: 'final_answer',
    }),
  ]);
}

export { initializeChainV2 };
