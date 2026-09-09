import { streamText, stepCountIs } from 'ai';
import {
  buildConversationMessages,
  validateAnswerGenerator,
} from './operations';
import type { ConversationChainParams } from '../types/conversation';
import { MAX_TOOL_STEPS } from '../types/common';
import type { BaseChatChainOutput } from '../types/common';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import {
  sanitizeAndValidateInput,
  moderateContent,
} from '../utils/common-operations';
import { partitionThreadDocuments } from '../utils/chain-utils';
import { mapFullStream } from '../utils/stream-mapper';

function formatThreadDocuments(docs: ThreadDocumentUI[]): string {
  const withContent = docs.filter((d) => d.content?.trim());
  if (withContent.length === 0) {
    return '';
  }

  const formatted = withContent
    .map((doc) => `[${doc.name}]:\n${doc.content}`)
    .join('\n\n');

  return `\n\n<thread_documents>\n${formatted}\n</thread_documents>\n\nIMPORTANT: The user has attached the documents above. Use them to answer the question. If the information is found in thread_documents, use it first.`;
}

export const conversationChain = async ({
  models,
  config,
}: ConversationChainParams): Promise<BaseChatChainOutput> => {
  validateAnswerGenerator(models.answerGenerator);

  return {
    stream: async (input) => {
      // Step 1: Sanitize and validate the input
      const sanitizedInput = sanitizeAndValidateInput(input);

      // Step 2: Moderate the content (no history moderation for conversation).
      // `MODERATION_ENABLED` is the global kill-switch (default: disabled).
      // When enabled, SaaS mode always enforces; on-premise respects org setting.
      const shouldModerateContent =
        process.env.MODERATION_ENABLED === '1' &&
        (!process.env.IS_ON_PREMISE ||
          config?.ragSettings?.contentModerationEnabled !== false);
      if (shouldModerateContent) {
        await moderateContent(
          models.contentModerator,
          sanitizedInput,
          false,
          config?.tracking,
        );
      }

      // Step 3: Build messages and stream the answer
      const { textDocs, imageDocs } = config?.threadDocuments?.length
        ? partitionThreadDocuments(config.threadDocuments)
        : { textDocs: [], imageDocs: [] };

      const { system, messages } = buildConversationMessages(
        sanitizedInput.question,
        sanitizedInput.chat_history,
        config?.answerInstructions,
        config?.projectInstruction,
        imageDocs.length > 0 ? imageDocs : undefined,
      );

      const hasTools =
        config?.mcpTools && Object.keys(config.mcpTools).length > 0;

      let effectiveSystem = system;

      if (textDocs.length > 0) {
        effectiveSystem += formatThreadDocuments(textDocs);
      }

      if (config?.mcpContext) {
        effectiveSystem += `\n\n${config.mcpContext}`;
      }

      const result = streamText({
        model: models.answerGenerator,
        system: effectiveSystem,
        messages,
        maxOutputTokens: config?.maxTokens,
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'conversation-stream',
        },
        ...(hasTools
          ? { tools: config!.mcpTools, stopWhen: stepCountIs(MAX_TOOL_STEPS) }
          : {}),
      });

      return {
        textStream: result.textStream,
        text: result.text,
        fullStream: mapFullStream(result.fullStream),
        reasoningText: result.reasoningText,
        usage: result.usage,
        // Conversation mode does not touch the knowledge base at all, which
        // is `null` rather than an empty result.
        retrieval: Promise.resolve(null),
      };
    },
  };
};
