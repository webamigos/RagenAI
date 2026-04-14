import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ModelMessage } from 'ai';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import type {
  VectorStoreClient,
  VectorStoreDocument,
} from '@/libs/vector-store/types';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';
import type { BaseChatChainInput } from '../types/common';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import {
  combineDocuments,
  buildUserMessageWithImages,
} from '../utils/chain-utils';
import {
  DEFAULT_ANSWER_INSTRUCTIONS,
  humanTemplates,
  systemTemplates,
} from './config';
import { ThreadDocumentRetriever } from '../utils/ThreadDocumentRetriever';
import { rerankDocuments, isRerankingEnabled } from '@/libs/reranker';
import { logger } from '@/app/lib/utils/logger';

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
  model: LanguageModelV3,
  input: BaseChatChainInput,
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

  const result = await generateText({
    model,
    system: systemTemplates.rephraseQuestion,
    messages,
    experimental_telemetry: {
      isEnabled: true,
      functionId: 'rephrase-question',
    },
  });

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
  model: LanguageModelV3,
  standaloneQuestion: string,
  variantCount: number = MULTI_QUERY_VARIANT_COUNT,
): Promise<string[]> {
  if (!model) {
    throw new Error('Error expanding queries: No model instance');
  }

  const humanMessage = humanTemplates.expandQueries
    .replace('{count}', String(variantCount))
    .replace('{question}', standaloneQuestion);

  try {
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
    logger.debug(
      {
        variantCount: variants.length,
        requestedCount: variantCount,
        standaloneQuestionLength: standaloneQuestion.length,
      },
      'Generated query variants for multi-query retrieval',
    );

    return variants;
  } catch (err) {
    // Graceful degradation: any failure falls back to single-query retrieval.
    // Log the error type but NOT the raw question (PII).
    logger.warn(
      { err, standaloneQuestionLength: standaloneQuestion.length },
      'Query expansion failed, falling back to single query',
    );
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
  model: LanguageModelV3,
  input: BaseChatChainInput,
  expandVariants = true,
  variantCount: number = MULTI_QUERY_VARIANT_COUNT,
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

    logger.debug(
      {
        variantCount: variants.length,
        requestedCount: variantCount,
        standaloneQuestionLength: standaloneQuestion.length,
      },
      'Rephrase + expand completed in single LLM call',
    );

    return { standaloneQuestion, variants };
  } catch (err) {
    // Graceful degradation: if structured output fails, fall back to input question with no variants.
    logger.warn(
      { err, questionLength: input.question.length },
      'Rephrase-and-expand failed, falling back to raw input question',
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
  litellmApiKey?: string,
  rerankingEnabled = true,
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
    const reranked = await rerankDocuments(
      queryList[0],
      uniqueDocs,
      maxDocuments,
      litellmApiKey,
    );
    return combineDocuments(reranked);
  }

  return combineDocuments(uniqueDocs.slice(0, maxDocuments));
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
): { system: string; messages: ModelMessage[] } {
  const effectiveAnswerInstructions =
    answerInstructions || DEFAULT_ANSWER_INSTRUCTIONS;
  const effectiveProjectInstructions = projectInstructions || '';

  const systemMessage = systemTemplates.answerChain
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

export function validateAnswerGenerator(model: LanguageModelV3): void {
  if (!model) {
    throw new Error('Error generating final answer: No model instance');
  }
}
