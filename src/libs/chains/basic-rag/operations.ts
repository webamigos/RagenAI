import { BaseChain } from 'langchain/chains';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  Runnable,
  RunnableLambda,
  RunnablePassthrough,
  RunnableSequence,
} from '@langchain/core/runnables';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import {
  DEFAULT_ANSWER_INSTRUCTIONS,
  HISTORY_CHARACTER_LIMIT,
  humanTemplates,
  MAX_USER_INPUT_LENGTH,
  systemTemplates,
} from './config';
import type { BasicRagChainInput } from '../types/basic-rag';
import {
  combineDocuments,
  limitChatHistory,
  normalizeAndSanitizeText,
  runModeration,
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

export const moderateContent = (moderator: BaseChain) => {
  if (!moderator) {
    throw new Error('Error moderating content: No moderation instance');
  }

  return new RunnableLambda({
    func: async (input: BasicRagChainInput) => {
      const contentToModerate = `${input.question} ${input.chat_history}`;
      await runModeration(moderator, contentToModerate);
      return input;
    },
  }).withConfig({
    runName: 'Moderate content',
  });
};

export const rephraseQuestion = (
  model: BaseChatModel
): Runnable<BasicRagChainInput, string> => {
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

export const retrieveRelevantDocuments = (
  vectorStore: VectorStore,
  maxDocuments = 4
) => {
  if (!vectorStore) {
    throw new Error('Error retrieving relevant documents: No vector store');
  }

  // TODO: pass organization_id as filter:
  // TODO: what about public access?
  // const { orgId } = auth();
  // const filter = {
  //   must: [{ key: "metadata.organization_id", match: { value: orgId } }],
  // };

  return RunnableSequence.from([
    (input) => input.standalone_question,
    // vectorStore.asRetriever({ k: maxDocuments, filter }),
    vectorStore.asRetriever({ k: maxDocuments }),
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
