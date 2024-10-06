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

type Document = {
  pageContent: string;
  metadata: Record<string, any>;
  id?: number | string;
};

const vectorStore = new SupabaseVectorStore(embeddingModel, {
  client: supaBaseClient,
  tableName: `documents`,
  queryName: 'match_documents',
});

const retriever = vectorStore.asRetriever();

const retrieverChain = RunnableSequence.from([
  (prevResult) => prevResult.question,
  retriever,
  combineDocuments,
]);

//TODO: fix types
let chain: any;
//

async function initializeChain() {
  const prompt = await getAssistantPrompt();

  const promptTemplate = PromptTemplate.fromTemplate(prompt);

  chain = RunnableSequence.from([
    {
      question: (input) => input.question,
      chat_history: (input) => input.chat_history,
      context: () => retrieverChain,
    },
    promptTemplate,
    createChatInstance,
    new StringOutputParser(),
  ]);

  return chain;
}

initializeChain();

function combineDocuments(docs: Document[]) {
  return docs.map((doc) => doc.pageContent).join('\n\n');
}

export { chain, retriever, retrieverChain };
