import { streamText, stepCountIs } from 'ai';
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
import { mapFullStream } from '../utils/stream-mapper';

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
        config?.projectInstruction,
      );

      const hasTools =
        config?.mcpTools && Object.keys(config.mcpTools).length > 0;

      const effectiveSystem = config?.mcpContext
        ? `${system}\n\n${config.mcpContext}`
        : system;

      const result = streamText({
        model: models.answerGenerator,
        system: effectiveSystem,
        messages,
        experimental_telemetry: { isEnabled: true },
        ...(hasTools
          ? { tools: config!.mcpTools, stopWhen: stepCountIs(5) }
          : {}),
      });

      return {
        textStream: result.textStream,
        text: result.text,
        fullStream: mapFullStream(result.fullStream),
        reasoningText: result.reasoningText,
        usage: result.usage,
      };
    },
  };
};
