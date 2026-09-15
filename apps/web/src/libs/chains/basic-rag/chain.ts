import { streamText, stepCountIs } from 'ai';
import { buildToolApprovalConfig } from '@/libs/mcp/client';
import {
  DEFAULT_KNOWLEDGE_SCOPE,
  scopeRetrieves,
} from '@ragenai/platform-contracts';
import {
  rephraseAndExpand,
  retrieveRelevantDocumentsWithIds,
  retrieveThreadDocuments,
  buildRagMessages,
  validateAnswerGenerator,
} from './operations';

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

      // Step 2: Moderate content and rephrase+expand in parallel.
      // Moderation doesn't affect the rephrased query — it only gates the
      // final answer. Running them concurrently saves one full LLM round-trip.
      // The merged rephraseAndExpand() produces the standalone question AND
      // query variants in a single LLM call (saves another round-trip vs the
      // old sequential rephrase → expandQueries flow).
      const retrievesKnowledgeBase = scopeRetrieves(
        config?.knowledgeScope ?? DEFAULT_KNOWLEDGE_SCOPE,
      );

      // Query variants exist to widen a vector search. With no vector search
      // they are a second LLM output nobody reads, so don't ask for them.
      const multiQueryEnabled =
        retrievesKnowledgeBase &&
        (config?.ragSettings?.multiQueryEnabled ?? true);
      const [, { standaloneQuestion, variants }] = await Promise.all([
        shouldModerate(config?.ragSettings)
          ? moderateContent(
              models.contentModerator,
              sanitizedInput,
              true,
              config?.tracking,
            )
          : Promise.resolve(),
        rephraseAndExpand(
          models.questionRephraser,
          sanitizedInput,
          multiQueryEnabled,
          undefined,
          config?.tracking,
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

      // Step 5: Retrieve KB documents and thread documents in parallel.
      //
      // `MODEL_ONLY` skips the knowledge base and *keeps* thread documents:
      // the level means "no retrieval, anything needed is attached to the
      // message", so attachments are the whole point of it rather than a
      // casualty. It also leaves `ragContextPresent` false below, which
      // relaxes the MCP write-tool gating — correct, and worth saying out
      // loud: that gate exists because retrieved document text is untrusted
      // input, and this turn retrieved none.
      const [retrieved, threadContext] = await Promise.all([
        retrievesKnowledgeBase
          ? retrieveRelevantDocumentsWithIds(
              vectorStore,
              retrievalQueries,
              config?.maxDocumentsToRetrieve,
              config?.metadataFilter,
              config?.ragSettings?.rerankingEnabled ?? true,
              config?.tracking,
            )
          : null,
        retrieveThreadDocuments(
          textThreadDocs,
          vectorStore,
          models.embeddings,
          standaloneQuestion,
          config?.maxDocumentsToRetrieve ?? 3,
        ),
      ]);

      // Empty when the knowledge base was not searched — `buildRagMessages`
      // renders no context block for an empty string, which is what a
      // MODEL_ONLY turn wants.
      const context = retrieved?.context ?? '';

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
      // Both kinds of retrieved text count, not just the knowledge base.
      // `buildRagMessages` puts `threadContext` into the system prompt too, so
      // an instruction inside an attached document reaches the model exactly
      // like one inside a retrieved chunk — and an attachment is the *less*
      // vetted of the two. Checking only `context` left the gate open for
      // MODEL_ONLY, which is the one level guaranteed to have no `context`.
      //
      // `threadContext` cannot be tested on its own: with no documents
      // `retrieveThreadDocuments` returns a non-empty "no documents" marker,
      // so a bare `.trim().length` is always true. Ask whether there were
      // documents first.
      //
      // Images count too, and they are the easiest of the three to overlook:
      // `imageThreadDocs` never touches `context` or `threadContext` — it goes
      // straight into the multimodal message — so an image-only turn produced
      // `false` here while the attachment reached the model. A vision model
      // reads instructions rendered into a picture as readily as typed ones,
      // and an uploaded image is no more vetted than an uploaded document.
      // Unlike `threadContext` there is no marker to work around, so the
      // length of the array is the whole test.
      const ragContextPresent =
        context.trim().length > 0 ||
        (textThreadDocs.length > 0 && threadContext.trim().length > 0) ||
        imageThreadDocs.length > 0;
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
        // `runtimeContext` is AI SDK 7's `experimental_context`. It reaches
        // each write tool's approval function, which fails closed without it.
        runtimeContext: toolGatingContext,
        ...(hasTools
          ? {
              tools: config!.mcpTools,
              toolApproval: buildToolApprovalConfig(config!.mcpTools),
              stopWhen: stepCountIs(MAX_TOOL_STEPS),
            }
          : {}),
      });

      return {
        textStream: result.textStream,
        text: result.text,
        fullStream: mapFullStream(result.fullStream),
        reasoningText: result.reasoningText,
        // Every step, not just the last — the value the monthly cost and
        // token ceilings aggregate.
        //
        // On AI SDK 6 the field for that was `totalUsage`, because `usage`
        // meant the final step alone and a tool-calling turn silently billed
        // one step out of up to MAX_TOOL_STEPS. AI SDK 7 redefined `usage` to
        // span all steps and deprecated `totalUsage` as its alias, so the
        // correct field is `usage` again and the number is unchanged. Do not
        // "restore" `totalUsage` here; it is the deprecated spelling now.
        usage: result.usage,
        // `null`, not an empty summary, when the knowledge base was never
        // searched: "found nothing" and "did not look" are different answers
        // and the reader is told which.
        retrieval: Promise.resolve(
          retrieved
            ? {
                sources: retrieved.sources,
                chunkCount: retrieved.chunkCount,
                durationMs: retrieved.durationMs,
              }
            : null,
        ),
      };
    },
  };
};
