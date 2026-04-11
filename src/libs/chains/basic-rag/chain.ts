import { streamText, stepCountIs } from 'ai';
import {
  expandQueries,
  rephraseQuestion,
  retrieveRelevantDocuments,
  retrieveThreadDocuments,
  buildRagMessages,
  validateAnswerGenerator,
} from './operations';

/**
 * Feature flag for multi-query expansion (ADR-15).
 * Enabled unless explicitly set to "0" or "false". Disable by setting
 * FEATURE_FLAG_MULTI_QUERY=0 in the environment.
 */
function isMultiQueryEnabled(): boolean {
  const value = process.env.FEATURE_FLAG_MULTI_QUERY;
  if (value === undefined) {
    return true;
  }
  return value !== '0' && value.toLowerCase() !== 'false';
}
import {
  sanitizeAndValidateInput,
  moderateContent,
} from '../utils/common-operations';
import type { BasicRagChainParams } from '../types/basic-rag';
import { MAX_TOOL_STEPS } from '../types/common';
import type { BaseChatChainOutput } from '../types/common';
import { partitionThreadDocuments } from '../utils/chain-utils';
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

      // Step 3: Expand into multiple query variants for retrieval (ADR-15).
      // The original standalone question is always the first query; variants
      // are additive. expandQueries() catches LLM/structured-output errors
      // internally and returns [] on failure, so retrieval falls back to a
      // single-query pipeline transparently — no try-catch needed here.
      // expandQueries() already dedupes variants against each other and the
      // standalone question, but we defensively dedupe the full list here too
      // (order-preserving) so any future change in expandQueries cannot cause
      // redundant Qdrant round-trips.
      const variants = isMultiQueryEnabled()
        ? await expandQueries(models.questionRephraser, standaloneQuestion)
        : [];
      const seenQueries = new Set<string>();
      const retrievalQueries = [standaloneQuestion, ...variants].filter((q) => {
        const key = q.trim().toLowerCase();
        if (seenQueries.has(key)) {
          return false;
        }
        seenQueries.add(key);
        return true;
      });

      // Step 4: Partition thread documents — images go to multimodal message, text to retrieval
      const { textDocs: textThreadDocs, imageDocs: imageThreadDocs } =
        partitionThreadDocuments(config?.threadDocuments || []);

      // Step 5: Retrieve KB documents and thread documents in parallel
      const [context, threadContext] = await Promise.all([
        retrieveRelevantDocuments(
          vectorStore,
          retrievalQueries,
          config?.maxDocumentsToRetrieve,
          config?.metadataFilter,
          config?.litellmApiKey,
        ),
        retrieveThreadDocuments(
          textThreadDocs,
          vectorStore,
          models.embeddings,
          standaloneQuestion,
          config?.maxDocumentsToRetrieve ?? 3,
        ),
      ]);

      // Step 5: Build messages and stream the answer
      const { system, messages } = buildRagMessages(
        standaloneQuestion,
        sanitizedInput.chat_history,
        context,
        threadContext,
        config?.answerInstructions,
        config?.projectInstruction,
        imageThreadDocs.length > 0 ? imageThreadDocs : undefined,
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
              stopWhen: stepCountIs(MAX_TOOL_STEPS),
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
