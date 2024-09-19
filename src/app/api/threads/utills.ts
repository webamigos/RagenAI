import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

import { TEMPLATE } from '../../config';
import {
  createChatInstance,
  embeddingModel,
  supeBaseClient,
} from './services/ChatService';

type Document = {
  pageContent: string;
  metadata: Record<string, any>;
  id?: number | string;
};

const vectorStore = new SupabaseVectorStore(embeddingModel, {
  client: supeBaseClient,
  tableName: 'documents',
  queryName: 'match_documents',
});
const retriever = vectorStore.asRetriever();

const retrieverChain = RunnableSequence.from([
  (prevResult) => prevResult.question,
  retriever,
  combineDocuments,
]);

const prompt = PromptTemplate.fromTemplate(TEMPLATE);

const chain = RunnableSequence.from([
  {
    question: (input) => input.question,
    chat_history: (input) => input.chat_history,
    context: () => retrieverChain,
  },
  prompt,
  createChatInstance,
  new StringOutputParser(),
]);

function combineDocuments(docs: Document[]) {
  return docs.map((doc) => doc.pageContent).join('\n\n');
}

export { chain, retriever, retrieverChain };
