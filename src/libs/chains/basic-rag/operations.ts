import { BaseChain } from 'langchain/chains';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  Runnable,
  RunnableLambda,
  RunnableSequence,
} from '@langchain/core/runnables';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import {
  HISTORY_CHARACTER_LIMIT,
  humanTemplates,
  MAX_USER_INPUT_LENGTH,
  systemTemplates,
} from './config';
import type { BasicRagChainInput } from '../types/chain';
import {
  combineDocuments,
  limitChatHistory,
  normalizeAndSanitizeText,
  zodUserInputValidator,
} from '../utils/chain-utils';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { VectorStore } from '@langchain/core/vectorstores';

export const sanitizeAndValidateInput = () => {
  return new RunnableLambda({
    func: (input: BasicRagChainInput) => ({
      question: zodUserInputValidator(
        normalizeAndSanitizeText(input.question),
        MAX_USER_INPUT_LENGTH
      ).question,
      chat_history: limitChatHistory(
        input.chat_history,
        HISTORY_CHARACTER_LIMIT
      ),
    }),
  }).withConfig({
    runName: 'Sanitize and validate input',
  });
};

export const moderateContent = (moderationInstance: BaseChain) => {
  return new RunnableLambda({
    func: async (input: BasicRagChainInput) => {
      try {
        const contentToModerate = `${input.question} ${input.chat_history}`;

        const { results } = await moderationInstance.invoke({
          input: contentToModerate,
        });

        const moderationResult = results[0];
        if (!moderationResult) {
          throw new Error('Moderation failed: No results returned');
        }

        if (moderationResult.flagged) {
          throw new Error('Input is flagged by moderation model');
        }

        return input;
      } catch (error) {
        throw new Error('Content moderation failed');
      }
    },
  }).withConfig({
    runName: 'Moderate content',
  });
};

export const rephraseQuestion = (
  modelInstance: BaseChatModel
): Runnable<BasicRagChainInput, string> => {
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', systemTemplates.rephraseQuestion],
    new MessagesPlaceholder('chat_history'),
    ['human', humanTemplates.rephraseQuestion],
  ]);

  return RunnableSequence.from([
    promptTemplate,
    modelInstance,
    new StringOutputParser(),
  ]).withConfig({
    runName: 'Rephrase question',
  });
};

export const retrieveRelevantDocuments = (vectorStore: VectorStore) => {
  return RunnableSequence.from([
    (input) => input.standalone_question,
    vectorStore.asRetriever(),
    combineDocuments,
  ]).withConfig({
    runName: 'Retrieve relevant documents',
  });
};

export const generateFinalAnswer = (
  modelInstance: BaseChatModel,
  runName: string
) => {
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', systemTemplates.answerChain],
    new MessagesPlaceholder('chat_history'),
    ['human', humanTemplates.answerChain],
  ]);
  return RunnableSequence.from([
    promptTemplate,
    modelInstance,
    new StringOutputParser().withConfig({
      runName,
    }),
  ]).withConfig({
    runName: 'Generate final answer',
  });
};
