import { generateObject, zodSchema } from 'ai';
import { z } from 'zod';
import { getChatModelForOrg } from '../../services/llm/provider.js';
import { withLangfuseTrace } from '../../services/langfuse-trace.js';
import { logger } from '../../services/logger.js';
import { SUMMARY_MODEL } from '../../consts.js';
import { db } from '../../services/db/db.js';

const MAX_INPUT_CHARS = 12_000;

export const MAX_SUGGESTIONS = 5;
export const MAX_SUGGESTION_CHARS = 300;

const dimensions = {
  chunkStructure: z.number().min(0).max(10),
  avgChunkSize: z.number().min(0).max(10),
  entityDensity: z.number().min(0).max(10),
  selfContainedness: z.number().min(0).max(10),
  qaAdherence: z.number().min(0).max(10),
  total: z.number().min(0).max(100),
};

/**
 * What the model has to return: the score, strictly, and its suggestions with
 * no length or count limit.
 *
 * The limits used to be here too, and `generateObject` rejects the whole object
 * when any field fails, so one suggestion of 301 characters threw away a valid
 * score. The A2 benchmark measured 25 of 69 calls lost that way
 * (`apps/web/evals/rag-benchmark/results/2026-09-26-rag-score-vs-retrieval.md`,
 * Finding 1). The suggestions are advisory text; the score is the product.
 */
export const ragScoreResponseSchema = z.object({
  ...dimensions,
  suggestions: z.array(z.string()),
});

/** What is stored: the same score, with the suggestions held to their limits. */
const ragScoreSchema = z.object({
  ...dimensions,
  suggestions: z
    .array(z.string().max(MAX_SUGGESTION_CHARS))
    .max(MAX_SUGGESTIONS),
});

export type RagScore = z.infer<typeof ragScoreSchema>;

/**
 * Hold the suggestions to what the stored shape allows, instead of failing the
 * score over them: at most five, each cut to 300 characters with an ellipsis.
 */
export function normalizeRagScore(
  raw: z.infer<typeof ragScoreResponseSchema>,
): RagScore {
  // Parsed, not cast: the result is checked against the stored shape, so a
  // change to the limits above cannot drift from what this produces.
  return ragScoreSchema.parse({
    ...raw,
    suggestions: raw.suggestions
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, MAX_SUGGESTIONS)
      .map((s) =>
        s.length > MAX_SUGGESTION_CHARS
          ? `${s.slice(0, MAX_SUGGESTION_CHARS - 1).trimEnd()}…`
          : s,
      ),
  });
}

const SYSTEM_PROMPT = `You are a RAG quality evaluator. Analyze the provided document for retrieval-augmented generation readiness.

Score each dimension from 0 to 10:

- chunkStructure (0–10): Presence of numbered headings (### 1.1, ### 1.2, etc.) that create natural chunk boundaries for text splitters. 0 = no headings at all, 10 = consistent numbered Q&A headings throughout.

- avgChunkSize (0–10): Whether content sections are 80–150 words each (ideal for embedding models like Cohere embed-multilingual-v3). 0 = single massive block or extremely short fragments, 10 = all sections in the 80–150 word range.

- entityDensity (0–10): Density of specific, searchable entities: proper names, monetary amounts, dates, legal article numbers, phone numbers, email addresses, time durations. These are critical signals for BM25/sparse retrieval. 0 = no specific entities, 10 = rich entities embedded throughout.

- selfContainedness (0–10): Whether each section is understandable without reading other sections. Each chunk should repeat enough context (names, references, amounts) that it makes sense in isolation. 0 = sections are fragments that require reading the whole document, 10 = every section stands alone.

- qaAdherence (0–10): Whether sections follow a question + answer structure with clear question headings. 0 = prose/narrative with no questions, 10 = consistent Q&A format throughout.

total (0–100): Weighted overall score. Calculate as: chunkStructure × 2.5 + avgChunkSize × 1.5 + entityDensity × 2 + selfContainedness × 2.5 + qaAdherence × 1.5

suggestions: Up to 5 concrete, actionable improvement suggestions, each at most 300 characters. Be specific about what to change, not vague. Reference specific parts of the document when possible.`;

/**
 * Score a document for RAG readiness at ingest time.
 *
 * Best-effort: returns null on any failure so the workflow can continue.
 * The score is written to UserFile.metadata.ragScore via mergeFileMetadata
 * in the workflow, not here — keeping the activity pure (LLM call only).
 */
export async function scoreDocumentForRag({
  documentText,
  orgId,
  projectId,
  userId,
  fileName,
}: {
  documentText: string;
  orgId: string;
  projectId?: string | null;
  userId?: string | null;
  fileName?: string;
}): Promise<RagScore | null> {
  const trimmed = documentText.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const truncated =
    trimmed.length > MAX_INPUT_CHARS
      ? trimmed.slice(0, MAX_INPUT_CHARS)
      : trimmed;

  try {
    const model = await getChatModelForOrg(orgId, SUMMARY_MODEL);

    const startedAt = Date.now();
    const result = await withLangfuseTrace(
      {
        name: 'score-document-for-rag',
        sessionId: orgId,
        tags: ['rag-scorer', SUMMARY_MODEL],
      },
      () =>
        generateObject({
          model,
          // zodSchema() is the AI SDK's bridge for zod schemas. This used to
          // need a @ts-expect-error for TS2589: the worker resolved a nested
          // zod 3 while the hoisted @ai-sdk/provider-utils resolved the root's
          // zod 4, and comparing two physically distinct zod packages is
          // unbounded. npm 11's resolution dedupes them onto zod 4, so the
          // suppression became an error itself — which is exactly how ADR-26
          // said it would announce that it was no longer needed.
          schema: zodSchema(ragScoreResponseSchema),
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `Evaluate the following document for RAG readiness:\n\n${truncated}`,
            },
          ],
          experimental_telemetry: { isEnabled: true },
        }),
    );

    await db.trackAiUsage({
      organizationId: orgId,
      projectId: projectId ?? null,
      userId: userId ?? null,
      step: 'CHAT_COMPLETION',
      provider: 'litellm',
      model: SUMMARY_MODEL,
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      totalTokens: result.usage?.totalTokens ?? 0,
      durationMs: Date.now() - startedAt,
      metadata: { kind: 'rag_scorer', fileName },
    });

    const score = normalizeRagScore(result.object);

    logger.info(
      { fileName, orgId, total: score.total },
      'Scored document for RAG readiness',
    );

    return score;
  } catch (err) {
    logger.warn(
      { err, fileName, orgId },
      'RAG scoring failed, continuing without score',
    );
    return null;
  }
}
