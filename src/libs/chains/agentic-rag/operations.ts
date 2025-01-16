import { RunnableLambda } from '@langchain/core/runnables';

import { limitChatHistory, zodUserInputValidator } from '../utils/chain-utils';

import {
  HISTORY_CHARACTER_LIMIT,
  MAX_USER_INPUT_LENGTH,
} from '../basic-rag/config';

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { normalizeAndSanitizeText } from '../utils/chain-utils';
import { BasicRagChainInput } from '../types/basic-rag';

export const generateFinalAnswer = (model: BaseChatModel, runName: string) => {
  const promptTemplate = ChatPromptTemplate.fromMessages([
    ['system', 'You are an expert at answering questions.'],
    ['human', 'Answer to: {question}'],
  ]);

  return RunnableSequence.from([
    promptTemplate,
    model,
    new StringOutputParser().withConfig({
      runName,
    }),
  ]).withConfig({
    runName: 'Generate final answer',
  });
};

export const sanitizeAndValidateInput = () => {
  return new RunnableLambda<BasicRagChainInput, BasicRagChainInput>({
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
