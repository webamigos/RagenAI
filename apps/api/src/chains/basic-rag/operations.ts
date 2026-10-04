import { Logger } from '@nestjs/common';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import type { ModelMessage } from 'ai';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import {
  expandHits,
  fuseAcrossQueries,
  selectSections,
  SELECTION_TIMEOUT_MS,
  type GenerateSelection,
} from '@ragenai/rag-core';
import type {
  VectorStoreClient,
  VectorStoreDocument,
} from '../../vector-store/types.js';
import type { EmbeddingsProvider } from '../../llm/types/embeddings.js';
import type {
  BaseChatChainInput,
  ChainTrackingContext,
} from '../types/common.js';
import type { ThreadDocumentUI } from '../types/thread-document.js';
import { type TrackAiUsage } from '../../ai-usage/types.js';
import {
  combineDocuments,
  buildUserMessageWithImages,
} from '../utils/chain-utils.js';
import {
  DEFAULT_ANSWER_INSTRUCTIONS,
  GROUNDING_RULES,
  humanTemplates,
  systemTemplates,
} from './config.js';
import { ThreadDocumentRetriever } from '../utils/thread-document-retriever.js';
import { rerankDocuments, isRerankingEnabled } from '../../reranker/index.js';
import { withSpan } from '../../telemetry/telemetry.js';

const logger = new Logger('BasicRagOperations');

type Message = {
  type: 'user' | 'assistant';
  content: string;
};

/** Multiplier for initial retrieval count when reranking is enabled. */
const RERANK_RETRIEVAL_MULTIPLIER = 3;

/**
 * Number of alternate phrasings to generate per turn. The total number of
 * queries issued to the vector store is this value + 1 (the original
 * standalone question is always included as the first query).
 */
export const MULTI_QUERY_VARIANT_COUNT = 1;

const expandQueriesSchema = z.object({
  variants: z
    .array(z.string())
    .describe('Alternative phrasings of the input question'),
});

const rephraseAndExpandSchema = z.object({
  standaloneQuestion: z
    .string()
    .describe(
      'The rephrased standalone question that captures the full intent without depending on chat history',
    ),
  variants: z
    .array(z.string())
    .describe('Alternative phrasings of the standalone question'),
});

/**
 * Fire-and-forget AiUsage record for a non-chat LLM call (rephrase / expand).
 * Errors are swallowed — broken telemetry must never sink a user-facing turn.
 *
 * `trackAiUsage` is an optional injected callback (not a global import) —
 * see ai-usage/types.ts and docs/adrs/21-monorepo-and-api-decoupling.md.
 * No-ops when not provided, same as when `tracking` is absent.
 */
function recordRephraseUsage(
  model: LanguageModelV4,
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
  durationMs: number,
  tracking: ChainTrackingContext,
  trackAiUsage: TrackAiUsage | undefined,
): void {
  if (!usage || !trackAiUsage) {
    return;
  }
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  void trackAiUsage({
    organizationId: tracking.organizationId,
    projectId: tracking.projectId ?? null,
    userId: tracking.userId ?? null,
    step: 'REPHRASING',
    provider: 'litellm',
    model: model.modelId,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    durationMs,
  }).catch(() => undefined);
}

/**
 * The model call `selectSections` makes, for `sectionSelection`: temperature
 * 0, cut off at the selection timeout, and recorded as `SECTION_SELECTION`
 * through the injected callback — a step of its own, so the AI-usage page can
 * say what selection costs. Mirrors apps/web's `sectionSelectionCall`.
 */
export function sectionSelectionCall(
  model: LanguageModelV4,
  tracking?: ChainTrackingContext,
  trackAiUsage?: TrackAiUsage,
): GenerateSelection {
  return async ({ system, prompt }) => {
    const startMs = Date.now();
    const result = await generateText({
      model,
      system,
      prompt,
      temperature: 0,
      abortSignal: AbortSignal.timeout(SELECTION_TIMEOUT_MS),
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'select-sections',
      },
    });
    if (tracking && trackAiUsage && result.usage) {
      const inputTokens = result.usage.inputTokens ?? 0;
      const outputTokens = result.usage.outputTokens ?? 0;
      void trackAiUsage({
        organizationId: tracking.organizationId,
        projectId: tracking.projectId ?? null,
        userId: tracking.userId ?? null,
        step: 'SECTION_SELECTION',
        provider: 'litellm',
        model: model.modelId,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        durationMs: Date.now() - startMs,
      }).catch(() => undefined);
    }
    return result.text;
  };
}

function formatChatHistory(chatHistory: string): Message[] {
  const lines = chatHistory.split('\n').filter((line) => line.trim());
  const messages: Message[] = [];

  lines.forEach((line) => {
    if (line.startsWith('USER: ')) {
      messages.push({
        type: 'user',
        content: line.replace('USER: ', '').trim(),
      });
    } else if (line.startsWith('ASSISTANT: ')) {
      messages.push({
        type: 'assistant',
        content: line.replace('ASSISTANT: ', '').trim(),
      });
    }
  });

  return messages;
}

export async function rephraseQuestion(
  model: LanguageModelV4,
  input: BaseChatChainInput,
  tracking?: ChainTrackingContext,
  trackAiUsage?: TrackAiUsage,
): Promise<string> {
  if (!model) {
    throw new Error('Error rephrasing question: No model instance');
  }

  const messages: ModelMessage[] = [];

  if (input.chat_history) {
    const formattedHistory = formatChatHistory(input.chat_history);
    for (const msg of formattedHistory) {
      messages.push({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
  }

  const humanMessage = humanTemplates.rephraseQuestion.replace(
    '{question}',
    input.question,
  );
  messages.push({ role: 'user', content: humanMessage });

  const startMs = Date.now();
  const result = await generateText({
    model,
    system: systemTemplates.rephraseQuestion,
    messages,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'rephrase-question',
    },
  });
  if (tracking) {
    recordRephraseUsage(
      model,
      result.usage,
      Date.now() - startMs,
      tracking,
      trackAiUsage,
    );
  }

  return result.text;
}

/**
 * Generate alternative phrasings of a standalone question for multi-query
 * retrieval. Uses structured output (Zod schema) so a malformed response
 * raises an error rather than returning invalid data.
 *
 * On any failure (LLM error, invalid structured output, empty array after
 * filtering), returns an empty array and lets the caller fall back to
 * single-query retrieval. The expansion step must never regress behavior.
 */
export async function expandQueries(
  model: LanguageModelV4,
  standaloneQuestion: string,
  variantCount: number = MULTI_QUERY_VARIANT_COUNT,
  tracking?: ChainTrackingContext,
  trackAiUsage?: TrackAiUsage,
): Promise<string[]> {
  if (!model) {
    throw new Error('Error expanding queries: No model instance');
  }

  const humanMessage = humanTemplates.expandQueries
    .replace('{count}', String(variantCount))
    .replace('{question}', standaloneQuestion);

  try {
    const startMs = Date.now();
    const result = await generateObject({
      model,
      schema: expandQueriesSchema,
      system: systemTemplates.expandQueries,
      messages: [{ role: 'user', content: humanMessage }],
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'expand-queries',
      },
    });
    if (tracking) {
      recordRephraseUsage(
        model,
        result.usage,
        Date.now() - startMs,
        tracking,
        trackAiUsage,
      );
    }

    // Defensive cleanup of LLM output:
    // 1. trim whitespace
    // 2. drop empty strings
    // 3. drop variants that are identical to the original standalone question
    //    (case-insensitive — LLMs sometimes regurgitate the input)
    // 4. dedupe by normalized form so the fan-out does not run duplicate searches
    // 5. cap at variantCount so the model cannot exceed its instructed budget
    const standaloneNormalized = standaloneQuestion.trim().toLowerCase();
    const seen = new Set<string>();
    const variants: string[] = [];
    for (const raw of result.object.variants) {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const normalized = trimmed.toLowerCase();
      if (normalized === standaloneNormalized) {
        continue;
      }
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      variants.push(trimmed);
      if (variants.length >= variantCount) {
        break;
      }
    }

    // Log non-sensitive diagnostics only — never log raw user text (PII).
    logger.debug('Generated query variants for multi-query retrieval', {
      variantCount: variants.length,
      requestedCount: variantCount,
      standaloneQuestionLength: standaloneQuestion.length,
    });

    return variants;
  } catch (err) {
    // Graceful degradation: any failure falls back to single-query retrieval.
    // Log the error type but NOT the raw question (PII).
    logger.warn('Query expansion failed, falling back to single query', {
      err,
      standaloneQuestionLength: standaloneQuestion.length,
    });
    return [];
  }
}

/**
 * Combined rephrase + query expansion in a single LLM call.
 *
 * Produces a standalone question from the chat history AND generates alternative
 * phrasings for multi-query retrieval — saving one full LLM round-trip compared
 * to calling rephraseQuestion() then expandQueries() sequentially.
 *
 * When `expandVariants` is false, the variants array is always empty (skips
 * multi-query entirely while still saving the separate rephrase call).
 *
 * Falls back to just the rephrased standalone question (no variants) on any
 * structured-output error — the expansion step must never regress behavior.
 */
export async function rephraseAndExpand(
  model: LanguageModelV4,
  input: BaseChatChainInput,
  expandVariants = true,
  variantCount: number = MULTI_QUERY_VARIANT_COUNT,
  tracking?: ChainTrackingContext,
  trackAiUsage?: TrackAiUsage,
): Promise<{ standaloneQuestion: string; variants: string[] }> {
  if (!model) {
    throw new Error('Error rephrasing question: No model instance');
  }

  const messages: ModelMessage[] = [];

  if (input.chat_history) {
    const formattedHistory = formatChatHistory(input.chat_history);
    for (const msg of formattedHistory) {
      messages.push({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
  }

  const expansionInstruction = expandVariants
    ? `Then generate exactly ${variantCount} alternative phrasing(s) of that standalone question using different vocabulary, synonyms, or a different level of abstraction. Each alternative must be a complete, standalone question. Do not include the standalone question itself in the variants array.`
    : 'Set variants to an empty array.';

  const humanMessage = `Rephrase the following question as a standalone question that captures the full intent without depending on chat history. ${expansionInstruction} Respond in the same language as the input question.\n\nQuestion: ${input.question}`;
  messages.push({ role: 'user', content: humanMessage });

  try {
    const startMs = Date.now();
    const result = await generateObject({
      model,
      schema: rephraseAndExpandSchema,
      system: systemTemplates.rephraseAndExpand,
      messages,
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'rephrase-and-expand',
      },
    });
    if (tracking) {
      recordRephraseUsage(
        model,
        result.usage,
        Date.now() - startMs,
        tracking,
        trackAiUsage,
      );
    }

    const standaloneQuestion = result.object.standaloneQuestion.trim();
    if (standaloneQuestion.length === 0) {
      // If the model returns empty, fall back to the raw input question.
      return { standaloneQuestion: input.question, variants: [] };
    }

    if (!expandVariants) {
      return { standaloneQuestion, variants: [] };
    }

    // Defensive cleanup — same as expandQueries():
    const standaloneNormalized = standaloneQuestion.toLowerCase();
    const seen = new Set<string>();
    const variants: string[] = [];
    for (const raw of result.object.variants) {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        continue;
      }
      const normalized = trimmed.toLowerCase();
      if (normalized === standaloneNormalized) {
        continue;
      }
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      variants.push(trimmed);
      if (variants.length >= variantCount) {
        break;
      }
    }

    logger.debug('Rephrase + expand completed in single LLM call', {
      variantCount: variants.length,
      requestedCount: variantCount,
      standaloneQuestionLength: standaloneQuestion.length,
    });

    return { standaloneQuestion, variants };
  } catch (err) {
    // Graceful degradation: if structured output fails, fall back to input question with no variants.
    logger.warn(
      'Rephrase-and-expand failed, falling back to raw input question',
      {
        err,
        questionLength: input.question.length,
      },
    );
    return { standaloneQuestion: input.question, variants: [] };
  }
}

/**
 * Retrieve relevant documents from the vector store with optional reranking.
 * Supports both single-query and multi-query retrieval.
 *
 * When multiple queries are provided:
 * 1. Fan out vector search in parallel (one per query)
 * 2. Deduplicate candidates by content string (first occurrence wins)
 * 3. Rerank the deduplicated pool to top-k
 *
 * Per-query retrieval count is divided by the number of queries so the
 * total pre-dedupe candidate pool stays roughly the same as single-query
 * behavior. This keeps the reranker input size bounded.
 *
 * When reranking is disabled (local dev without Bedrock), skips the rerank
 * step and returns the first `maxDocuments` deduplicated results.
 */
export async function retrieveRelevantDocuments(
  vectorStore: VectorStoreClient,
  queries: string | string[],
  maxDocuments = 4,
  metadataFilter?: object,
  rerankingEnabled = true,
  tracking?: {
    organizationId?: string | null;
    userId?: string | null;
    projectId?: string | null;
  },
  trackAiUsage?: TrackAiUsage,
): Promise<string> {
  if (!vectorStore) {
    throw new Error('Error retrieving relevant documents: No vector store');
  }

  const queryList = Array.isArray(queries) ? queries : [queries];
  if (queryList.length === 0) {
    return combineDocuments([]);
  }

  const filter =
    metadataFilter && Object.keys(metadataFilter).length > 0
      ? metadataFilter
      : undefined;

  const useReranking = rerankingEnabled && isRerankingEnabled();
  const totalPoolTarget = useReranking
    ? maxDocuments * RERANK_RETRIEVAL_MULTIPLIER
    : maxDocuments;
  // Divide the pool target across queries, floored at maxDocuments so every
  // branch returns at least enough results to matter.
  const perQueryCount = Math.max(
    maxDocuments,
    Math.floor(totalPoolTarget / queryList.length),
  );

  const resultsPerQuery = await Promise.all(
    queryList.map((q) =>
      vectorStore.similaritySearch(q, perQueryCount, filter),
    ),
  );

  // Dedupe by pageContent — chunks identical in content are the same document
  // even if retrieved by different query variants.
  const deduped = new Map<string, VectorStoreDocument>();
  for (const docs of resultsPerQuery) {
    for (const doc of docs) {
      if (!deduped.has(doc.pageContent)) {
        deduped.set(doc.pageContent, doc);
      }
    }
  }
  const uniqueDocs = Array.from(deduped.values());

  if (useReranking && uniqueDocs.length > maxDocuments) {
    // Rerank using the first (primary) query — it is the original standalone
    // phrasing, which is the most faithful representation of user intent.
    const reranked = await rerankDocuments(queryList[0], uniqueDocs, {
      topN: maxDocuments,
      tracking,
      trackAiUsage,
    });
    return combineDocuments(reranked);
  }

  return combineDocuments(uniqueDocs.slice(0, maxDocuments));
}

/**
 * Same as {@link retrieveRelevantDocuments} but also returns the unique
 * `file_id` values extracted from retrieved document metadata.
 *
 * Used by the basic-RAG chain to populate `ChainStreamResult.sourceFileIds`
 * for the Knowledge Analytics Dashboard.
 */
export async function retrieveRelevantDocumentsWithIds(
  vectorStore: VectorStoreClient,
  queries: string | string[],
  maxDocuments = 4,
  metadataFilter?: object,
  rerankingEnabled = true,
  tracking?: {
    organizationId?: string | null;
    userId?: string | null;
    projectId?: string | null;
  },
  trackAiUsage?: TrackAiUsage,
  /**
   * `contextExpansion` for this organization: kept prose chunks are widened by
   * their neighbours through `getChunksByIndex`, inside the same filter.
   * Absent is off.
   */
  expansion?: { orgId: string },
  /**
   * `sectionSelection` for this organization: a model picks the passages from
   * the widened pool, in the reranker's slot — the reranker does not run.
   * Absent is off.
   */
  selection?: { generate: GenerateSelection },
  /**
   * `crossQueryFusion` for this organization: when neither the reranker nor
   * selection chooses, the queries' hit lists are merged by reciprocal rank
   * before the cut, so a multi-query variant's hits can be kept. Absent is
   * off, which keeps the first query's hits (spec 2026-10-03-retrieval-claims,
   * B0).
   */
  crossQueryFusion?: boolean,
): Promise<{ context: string; fileIds: string[] }> {
  if (!vectorStore) {
    throw new Error('Error retrieving relevant documents: No vector store');
  }

  const queryList = Array.isArray(queries) ? queries : [queries];
  if (queryList.length === 0) {
    return { context: combineDocuments([]), fileIds: [] };
  }

  const filter =
    metadataFilter && Object.keys(metadataFilter).length > 0
      ? metadataFilter
      : undefined;

  // Selection takes the reranker's slot (D2 of the spec): never both.
  const useSelection = selection !== undefined;
  const useReranking =
    !useSelection && rerankingEnabled && isRerankingEnabled();
  const totalPoolTarget =
    useReranking || useSelection
      ? maxDocuments * RERANK_RETRIEVAL_MULTIPLIER
      : maxDocuments;
  const perQueryCount = Math.max(
    maxDocuments,
    Math.floor(totalPoolTarget / queryList.length),
  );

  // The retrieval stage is the part of the pipeline with no telemetry of its
  // own: the LLM calls around it are already covered by the AI SDK's
  // experimental_telemetry, but the fan-out/dedupe/rerank work in between was
  // invisible. Child spans sit inside the stages rather than around the
  // Promise.all, so the parallel searches still read as parallel.
  return withSpan(
    'rag.retrieve',
    {
      'rag.query_count': queryList.length,
      'rag.max_documents': maxDocuments,
      'rag.per_query_count': perQueryCount,
      'rag.reranking_enabled': useReranking,
    },
    async (span) => {
      const resultsPerQuery = await Promise.all(
        queryList.map((q) =>
          vectorStore.similaritySearch(q, perQueryCount, filter),
        ),
      );

      const deduped = new Map<string, VectorStoreDocument>();
      for (const docs of resultsPerQuery) {
        for (const doc of docs) {
          if (!deduped.has(doc.pageContent)) {
            deduped.set(doc.pageContent, doc);
          }
        }
      }
      const uniqueDocs = Array.from(deduped.values());

      const retrievedCount = resultsPerQuery.reduce(
        (sum, docs) => sum + docs.length,
        0,
      );
      span.setAttribute('rag.retrieved_count', retrievedCount);
      span.setAttribute('rag.deduped_count', uniqueDocs.length);

      let finalDocs: VectorStoreDocument[];
      if (useSelection && uniqueDocs.length > maxDocuments) {
        const result = await withSpan(
          'rag.select',
          { 'rag.select_input_count': uniqueDocs.length },
          async (selectSpan) => {
            const r = await selectSections({
              question: queryList[0],
              candidates: uniqueDocs,
              maxKeep: maxDocuments,
              generate: selection.generate,
            });
            selectSpan.setAttribute('rag.select_kept_count', r.kept.length);
            if (r.fallback) {
              selectSpan.setAttribute('rag.select_fallback', r.fallback);
            }
            return r;
          },
        );
        finalDocs = result.kept;
        if (result.fallback) {
          logger.warn(
            `Section selection fell back to fusion order: ${result.fallback}`,
          );
        }
      } else if (useReranking && uniqueDocs.length > maxDocuments) {
        finalDocs = await withSpan(
          'rag.rerank',
          { 'rag.rerank_input_count': uniqueDocs.length },
          async () =>
            rerankDocuments(queryList[0], uniqueDocs, {
              topN: maxDocuments,
              tracking,
              trackAiUsage,
            }),
        );
      } else {
        // Concatenated, the first query's hits fill the cut and a variant's
        // never reach the model; fused, each list contributes by rank.
        finalDocs = (
          crossQueryFusion ? fuseAcrossQueries(resultsPerQuery) : uniqueDocs
        ).slice(0, maxDocuments);
      }

      // After the cut, so the reranker still chooses which hits are kept and
      // expansion only widens them. A failed lookup leaves a hit as it was.
      if (expansion && vectorStore.getChunksByIndex) {
        const getChunksByIndex = vectorStore.getChunksByIndex.bind(vectorStore);
        const result = await withSpan(
          'rag.expand',
          { 'rag.expand_input_count': finalDocs.length },
          async (expandSpan) => {
            const r = await expandHits({
              hits: finalDocs,
              maxDocuments,
              fetchChunks: (fileId, indexes) =>
                getChunksByIndex(expansion.orgId, fileId, indexes, filter),
            });
            expandSpan.setAttribute('rag.expand_added_count', r.addedChunks);
            expandSpan.setAttribute('rag.expand_failed_files', r.failedFiles);
            return r;
          },
        );
        if (result.failedFiles > 0) {
          logger.warn(
            `Context expansion: ${result.failedFiles} neighbour lookup(s) failed; those hits render unexpanded`,
          );
        }
        finalDocs = result.docs;
      }

      const seenFileIds = new Set<string>();
      const fileIds: string[] = [];
      for (const doc of finalDocs) {
        const fileId = doc.metadata?.file_id;
        if (
          typeof fileId === 'string' &&
          fileId.length > 0 &&
          !seenFileIds.has(fileId)
        ) {
          seenFileIds.add(fileId);
          fileIds.push(fileId);
        }
      }

      span.setAttribute('rag.final_count', finalDocs.length);
      span.setAttribute('rag.file_count', fileIds.length);

      return { context: combineDocuments(finalDocs), fileIds };
    },
  );
}

export async function retrieveThreadDocuments(
  threadDocuments: ThreadDocumentUI[],
  vectorStore: VectorStoreClient,
  embeddings: EmbeddingsProvider,
  standaloneQuestion: string,
  maxChunks: number = 3,
): Promise<string> {
  if (!threadDocuments || threadDocuments.length === 0) {
    return '[Brak dokumentow watku - uzytkownik nie wgral zadnych plikow]';
  }

  const retriever = new ThreadDocumentRetriever(vectorStore, embeddings);
  const relevantChunks = await retriever.retrieveRelevantChunks(
    threadDocuments,
    standaloneQuestion,
    maxChunks,
  );

  return combineDocuments(relevantChunks);
}

export function buildRagMessages(
  standaloneQuestion: string,
  chatHistory: string | undefined,
  context: string,
  threadContext: string,
  answerInstructions?: string | null,
  projectInstructions?: string,
  imageDocuments?: ThreadDocumentUI[],
  answerFromDocumentsOnly?: boolean,
): { system: string; messages: ModelMessage[] } {
  const effectiveAnswerInstructions =
    answerInstructions || DEFAULT_ANSWER_INSTRUCTIONS;
  const effectiveProjectInstructions = projectInstructions || '';

  // Filled first, while the only `{grounding_rule}` in the string is the
  // template's own — see `GROUNDING_RULES`.
  const systemMessage = systemTemplates.answerChain
    .replace(
      '{grounding_rule}',
      answerFromDocumentsOnly
        ? GROUNDING_RULES.strict
        : GROUNDING_RULES.default,
    )
    .replace('{answer_instructions}', effectiveAnswerInstructions)
    .replace('{project_instructions}', effectiveProjectInstructions)
    .replace('{context}', context)
    .replace('{thread_context}', threadContext);

  const messages: ModelMessage[] = [];

  if (chatHistory) {
    const formattedHistory = formatChatHistory(chatHistory);
    for (const msg of formattedHistory) {
      messages.push({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
  }

  const humanMessage = humanTemplates.answerChain.replace(
    '{standalone_question}',
    standaloneQuestion,
  );

  messages.push({
    role: 'user',
    content: buildUserMessageWithImages(humanMessage, imageDocuments),
  });

  return { system: systemMessage, messages };
}

export function validateAnswerGenerator(model: LanguageModelV4): void {
  if (!model) {
    throw new Error('Error generating final answer: No model instance');
  }
}
