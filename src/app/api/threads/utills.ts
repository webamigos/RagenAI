import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import { LangChainTracer } from 'langchain/callbacks';

import { standaloneQuestionTemplate, answerTemplate } from '../../config';
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

const standaloneQuestionPrompt = PromptTemplate.fromTemplate(
  standaloneQuestionTemplate
);
const standaloneQuestionChain = standaloneQuestionPrompt
  .pipe(createChatInstance)
  .pipe(new StringOutputParser());
const answerPrompt = PromptTemplate.fromTemplate(answerTemplate);
const answerChain = answerPrompt
  .pipe(createChatInstance)
  .pipe(new StringOutputParser());
const retrieverChain = RunnableSequence.from([
  (prevResult) => prevResult.standalone_question,
  retriever,
  combineDocuments,
]);

const chain = RunnableSequence.from([
  {
    standalone_question: standaloneQuestionChain,
    original_input: new RunnablePassthrough(),
  },
  {
    context: retrieverChain,
    question: ({ original_input }) => original_input.question,
    conv_history: ({ original_input }) => original_input.conv_history,
  },
]);

function combineDocuments(docs: Document[]) {
  return docs.map((doc) => doc.pageContent).join('\n\n');
}

export {
  chain,
  retriever,
  answerChain,
  answerPrompt,
  retrieverChain,
  standaloneQuestionPrompt,
};
