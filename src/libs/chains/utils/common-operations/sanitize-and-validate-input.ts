import { RunnableLambda } from '@langchain/core/runnables';
import { HISTORY_CHARACTER_LIMIT, MAX_USER_INPUT_LENGTH } from '../constants';
import {
  zodUserInputValidator,
  normalizeAndSanitizeText,
  limitChatHistory,
} from '../chain-utils';
import type { BaseChatChainInput } from '../../types/common';

export const sanitizeAndValidateInput = () => {
  return new RunnableLambda({
    func: (input: BaseChatChainInput) => ({
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
