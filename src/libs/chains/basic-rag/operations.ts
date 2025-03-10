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
} from '@langchain/core/runnables';
import { VectorStore } from '@langchain/core/vectorstores';
import type { BaseChatChainInput } from '../types/common';
import { combineDocuments } from '../utils/chain-utils';
import {
  DEFAULT_ANSWER_INSTRUCTIONS,
  humanTemplates,
  systemTemplates,
} from './config';

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

export const generateFinalAnswer = (
  model: BaseChatModel,
  runName: string,
  answerInstructions?: string | null
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
