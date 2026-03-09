import { streamText, stepCountIs } from 'ai';
import {
  rephraseQuestion,
  retrieveRelevantDocuments,
  retrieveThreadDocuments,
  buildRagMessages,
  validateAnswerGenerator,
} from './operations';
import {
  sanitizeAndValidateInput,
  moderateContent,
} from '../utils/common-operations';
import type { BasicRagChainParams } from '../types/basic-rag';
import type { BaseChatChainOutput } from '../types/common';
import { mapFullStream } from '../utils/stream-mapper';

export const basicRagChain = async ({
  vectorStore,
  models,
  config,
}: BasicRagChainParams): Promise<BaseChatChainOutput> => {
  validateAnswerGenerator(models.answerGenerator);

  return {
    stream: async (input) => {
      // Step 1: Sanitize and validate the input
      const sanitizedInput = sanitizeAndValidateInput(input);

      // Step 2: Moderate content first, then rephrase
      await moderateContent(
        models.contentModerator,
        sanitizedInput,
        true,
        config?.tracking,
      );
      const standaloneQuestion = await rephraseQuestion(
        models.questionRephraser,
        sanitizedInput,
      );

      // Step 3: Retrieve KB documents and thread documents in parallel
      const [context, threadContext] = await Promise.all([
        retrieveRelevantDocuments(
          vectorStore,
          standaloneQuestion,
          config?.maxDocumentsToRetrieve,
          config?.metadataFilter,
        ),
        retrieveThreadDocuments(
          config?.threadDocuments || [],
          vectorStore,
          models.embeddings,
          standaloneQuestion,
          config?.maxDocumentsToRetrieve ?? 3,
        ),
      ]);

      // Step 4: Build messages and stream the answer
      const { system, messages } = buildRagMessages(
        standaloneQuestion,
        sanitizedInput.chat_history,
        context,
        threadContext,
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
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'basic-rag-stream',
        },
        ...(hasTools
          ? {
              tools: config!.mcpTools,
              stopWhen: stepCountIs(10),
            }
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
