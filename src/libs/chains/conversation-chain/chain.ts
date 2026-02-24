import { streamText } from 'ai';
import {
  buildConversationMessages,
  validateAnswerGenerator,
} from './operations';
import type { ConversationChainParams } from '../types/conversation';
import type { BaseChatChainOutput } from '../types/common';
import {
  sanitizeAndValidateInput,
  moderateContent,
} from '../utils/common-operations';

export const conversationChain = async ({
  models,
  config,
}: ConversationChainParams): Promise<BaseChatChainOutput> => {
  validateAnswerGenerator(models.answerGenerator);

  return {
    stream: async (input) => {
      // Step 1: Sanitize and validate the input
      const sanitizedInput = sanitizeAndValidateInput(input);

      // Step 2: Moderate the content (no history moderation for conversation)
      await moderateContent(models.contentModerator, sanitizedInput, false);

      // Step 3: Build messages and stream the answer
      const { system, messages } = buildConversationMessages(
        sanitizedInput.question,
        sanitizedInput.chat_history,
        config?.answerInstructions,
        config?.projectInstruction
      );

      return streamText({
        model: models.answerGenerator,
        system,
        messages,
      });
    },
  };
};
