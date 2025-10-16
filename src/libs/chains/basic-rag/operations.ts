import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import {
  Runnable,
  RunnablePassthrough,
  RunnableSequence,
  RunnableLambda,
} from '@langchain/core/runnables';
import { VectorStore } from '@langchain/core/vectorstores';
import { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatChainInput } from '../types/common';
import { combineDocuments } from '../utils/chain-utils';
import {
  DEFAULT_ANSWER_INSTRUCTIONS,
  humanTemplates,
  systemTemplates,
} from './config';
import { ThreadDocumentRetriever } from '../utils/ThreadDocumentRetriever';
import { ThreadDocumentUI } from '@/app/contracts/ThreadDocument';
import { logger } from '@/app/lib/utils/logger';

export const rephraseQuestion = (
  model: BaseChatModel
): Runnable<BaseChatChainInput, string> => {
  if (!model) {
    throw new Error('Error rephrasing question: No model instance');
  }

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', systemTemplates.rephraseQuestion],
    new MessagesPlaceholder('chat_history'),
    ['human', humanTemplates.rephraseQuestion],
  ]);

  return RunnableSequence.from([
    promptTemplate,
    model,
    new StringOutputParser(),
  ]).withConfig({
    runName: 'Rephrase question',
  });
};

export const retrieveRelevantDocuments = async (
  vectorStore: VectorStore,
  maxDocuments = 4,
  metadataFilter?: object
) => {
  if (!vectorStore) {
    throw new Error('Error retrieving relevant documents: No vector store');
  }

  return RunnableSequence.from([
    (input) => input.standalone_question,
    vectorStore.asRetriever({ k: maxDocuments, filter: metadataFilter }),
    combineDocuments,
  ]).withConfig({
    runName: 'Retrieve relevant documents',
  });
};

/**
 * Retrieve thread-specific documents using dual strategy:
 * 1. Vectorstore search (optimized with pre-computed embeddings)
 * 2. Inline content search (immediate access with on-demand embeddings)
 */
export const retrieveThreadDocuments = (
  threadDocuments: ThreadDocumentUI[],
  vectorStore: VectorStore,
  embeddings: Embeddings,
  maxChunks: number = 3
) => {
  if (!threadDocuments || threadDocuments.length === 0) {
    return RunnableLambda.from(
      () => '[Brak dokumentów wątku - użytkownik nie wgrał żadnych plików]'
    ).withConfig({
      runName: 'Retrieve thread documents (empty)',
    });
  }

  const retriever = new ThreadDocumentRetriever(vectorStore, embeddings);

  return RunnableLambda.from(async (input: any) => {
    const relevantChunks = await retriever.retrieveRelevantChunks(
      threadDocuments,
      input.standalone_question || input.question,
      maxChunks
    );

    const combinedResult = combineDocuments(relevantChunks);

    return combinedResult;
  }).withConfig({
    runName: 'Retrieve thread documents',
  });
};

export const generateFinalAnswer = (
  model: BaseChatModel,
  runName: string,
  answerInstructions?: string | null,
  projectInstructions?: string
) => {
  if (!model) {
    throw new Error('Error generating final answer: No model instance');
  }

  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', systemTemplates.answerChain],
    new MessagesPlaceholder('chat_history'),
    ['human', humanTemplates.answerChain],
  ]);

  return RunnableSequence.from([
    RunnablePassthrough.assign({
      answer_instructions: () =>
        answerInstructions || DEFAULT_ANSWER_INSTRUCTIONS,
      project_instructions: () =>
        projectInstructions ? projectInstructions : '',
    }),
    promptTemplate,
    model,
    new StringOutputParser().withConfig({
      runName,
    }),
  ]).withConfig({
    runName: 'Generate final answer',
  });
};
