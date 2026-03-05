import { streamText } from 'ai';
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
      await moderateContent(models.contentModerator, sanitizedInput);
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

      const result = streamText({
        model: models.answerGenerator,
        system,
        messages,
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
