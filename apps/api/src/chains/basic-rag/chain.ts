import { streamText, stepCountIs } from 'ai';
import {
  rephraseAndExpand,
  retrieveRelevantDocumentsWithIds,
  retrieveThreadDocuments,
  buildRagMessages,
  validateAnswerGenerator,
} from './operations.js';

/**
 * Whether content moderation should run. `MODERATION_ENABLED` is the global
 * kill-switch (default: disabled). When enabled, SaaS mode always enforces
 * moderation; on-premise respects the per-org setting.
 */
function shouldModerate(
  ragSettings: { contentModerationEnabled: boolean } | undefined,
): boolean {
  if (process.env.MODERATION_ENABLED !== '1') {
    return false;
  }
  if (!process.env.IS_ON_PREMISE) {
    return true;
  }
  return ragSettings?.contentModerationEnabled !== false;
}

import {
  sanitizeAndValidateInput,
  moderateContent,
} from '../utils/common-operations/index.js';
import type { BasicRagChainParams } from '../types/basic-rag.js';
import { MAX_TOOL_STEPS } from '../types/common.js';
import type { BaseChatChainOutput } from '../types/common.js';
import { partitionThreadDocuments } from '../utils/chain-utils.js';
import { mapFullStream } from '../utils/stream-mapper.js';

// Kept async to preserve the original ragen-app call signature (`await
// basicRagChain(...)`) — only the nested `stream` function below awaits.
// The multiline destructured signature puts the `=>` several lines below
// the `async` keyword, so `eslint-disable-next-line` can't target it —
// use a block disable instead.
/* eslint-disable @typescript-eslint/require-await */
export const basicRagChain = async ({
  vectorStore,
  models,
  config,
}: BasicRagChainParams): Promise<BaseChatChainOutput> => {
  /* eslint-enable @typescript-eslint/require-await */
  validateAnswerGenerator(models.answerGenerator);

  return {
    stream: async (input) => {
      // Step 1: Sanitize and validate the input
      const sanitizedInput = sanitizeAndValidateInput(input);

      // Step 2: Moderate content and rephrase+expand in parallel.
      // Moderation doesn't affect the rephrased query — it only gates the
      // final answer. Running them concurrently saves one full LLM round-trip.
      // The merged rephraseAndExpand() produces the standalone question AND
      // query variants in a single LLM call (saves another round-trip vs the
      // old sequential rephrase → expandQueries flow).
      const multiQueryEnabled = config?.ragSettings?.multiQueryEnabled ?? true;
      const [, { standaloneQuestion, variants }] = await Promise.all([
        shouldModerate(config?.ragSettings)
          ? moderateContent(
              models.contentModerator,
              sanitizedInput,
              true,
              config?.tracking,
              config?.trackAiUsage,
            )
          : Promise.resolve(),
        rephraseAndExpand(
          models.questionRephraser,
          sanitizedInput,
          multiQueryEnabled,
          undefined,
          config?.tracking,
          config?.trackAiUsage,
        ),
      ]);

      // Defensively dedupe the full query list (order-preserving) so any
      // future change in rephraseAndExpand cannot cause redundant Qdrant
      // round-trips.
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
      const [{ context, fileIds }, threadContext] = await Promise.all([
        retrieveRelevantDocumentsWithIds(
          vectorStore,
          retrievalQueries,
          config?.maxDocumentsToRetrieve,
          config?.metadataFilter,
          config?.litellmApiKey,
          config?.ragSettings?.rerankingEnabled ?? true,
          config?.tracking,
          config?.trackAiUsage,
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

      // Phase 2 prompt-injection gating: tell the MCP tool wrappers
      // whether retrieved RAG context is present in this turn. Write
      // tools consult this via their `needsApproval` predicate and
      // pause execution when true (exfiltration via malicious document
      // content is the vector we're closing). `approvedToolCalls` is
      // always empty in Phase 2a; Phase 2b will populate it from the
      // request body on explicit user approval.
      const ragContextPresent = context.trim().length > 0;
      const toolGatingContext = {
        ragContextPresent,
        approvedToolCalls: config?.approvedToolCalls ?? [],
      };

      const result = streamText({
        model: models.answerGenerator,
        system: effectiveSystem,
        messages,
        maxOutputTokens: config?.maxTokens,
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'basic-rag-stream',
        },
        experimental_context: toolGatingContext,
        ...(hasTools
          ? {
              tools: config.mcpTools,
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
        sourceFileIds: Promise.resolve(fileIds),
      };
    },
  };
};
