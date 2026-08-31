import {
  HISTORY_CHARACTER_LIMIT,
  MAX_USER_INPUT_LENGTH,
} from '../constants.js';
import {
  zodUserInputValidator,
  normalizeAndSanitizeText,
  limitChatHistory,
} from '../chain-utils.js';
import type { BaseChatChainInput } from '../../types/common.js';

export const sanitizeAndValidateInput = (
  input: BaseChatChainInput,
): BaseChatChainInput => {
  return {
    question: zodUserInputValidator(
      normalizeAndSanitizeText(input.question),
      MAX_USER_INPUT_LENGTH,
    ).question,
    chat_history: limitChatHistory(input.chat_history, HISTORY_CHARACTER_LIMIT),
  };
};
