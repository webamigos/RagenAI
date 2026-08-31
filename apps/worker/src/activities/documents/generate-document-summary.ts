import { generateText } from 'ai';
import { getChatModelForOrg } from '../../services/llm/provider';
import { withLangfuseTrace } from '../../services/langfuse-trace';
import { logger } from '../../services/logger';
import { SUMMARY_MODEL } from '../../consts';
import { db } from '../../services/db/db';

/**
 * Maximum input characters sent to the summarization LLM. At ~4 chars/token
 * this is roughly 12k tokens — well under typical LLM context windows
 * and keeps per-document cost bounded for very long files. Truncation is
 * acceptable because summaries are a lossy overview; the first N characters
 * of a document typically contain the most summary-worthy information
 * (intro, abstract, table of contents).
 */
const MAX_INPUT_CHARS = 50_000;

const SYSTEM_PROMPT = `You are a document summarization assistant for a RAG knowledge base. Given the text content of a document, produce a concise 1-2 paragraph summary (200-300 words total) that captures:
- What the document is about (topic, purpose)
- The key facts, decisions, or conclusions it contains
- Any named entities that are central (people, organizations, products, dates) — but only if they matter to the summary

Rules:
- Respond in the same language as the document. If the document is mixed-language, respond in the dominant language.
- Write in a neutral, factual tone suitable for retrieval matching.
- Do not invent information, do not speculate, do not add commentary about the document itself ("This document describes...") — just summarize the content directly.
- Do not use markdown formatting, bullet points, or headings. Plain prose only.
- If the document is empty, trivially short, or not summarizable, respond with a single short sentence describing what is present.`;

/**
 * Feature flag for document summary generation at ingest time (ADR-16).
 * Enabled unless explicitly set to "0" or "false". Disable by setting
 * FEATURE_FLAG_DOC_SUMMARIES=0 in the environment.
 */
function isDocSummariesEnabled(): boolean {
  const value = process.env.FEATURE_FLAG_DOC_SUMMARIES;
  if (value === undefined) {
    return true;
  }
  return value !== '0' && value.toLowerCase() !== 'false';
}

/**
 * Generate a 1-2 paragraph summary of a document for ingest-time enrichment.
 *
 * Behavior:
 * - Feature flag off → returns empty string, no LLM call made.
 * - Input text empty/whitespace → returns empty string.
 * - LLM error (timeout, rate limit, etc.) → logs a warning, returns empty
 *   string. Never throws. Summary enrichment is a quality feature, not a
 *   correctness requirement — the workflow must continue to ingest the
 *   document even if summarization fails.
 * - Long inputs are truncated to MAX_INPUT_CHARS before being sent.
 */
export async function generateDocumentSummary({
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
}): Promise<string> {
  if (!isDocSummariesEnabled()) {
    return '';
  }

  const trimmed = documentText.trim();
  if (trimmed.length === 0) {
    return '';
  }

  const truncated =
    trimmed.length > MAX_INPUT_CHARS
      ? trimmed.slice(0, MAX_INPUT_CHARS)
      : trimmed;

  const fileNameHint = fileName ? `File name: ${fileName}\n\n` : '';
  const prompt = `${fileNameHint}Document content:\n\n${truncated}`;

  try {
    const model = await getChatModelForOrg(orgId, SUMMARY_MODEL);

    const startedAt = Date.now();
    const result = await withLangfuseTrace(
      {
        name: 'generate-document-summary',
        sessionId: orgId,
        tags: ['summary', SUMMARY_MODEL],
      },
      () =>
        generateText({
          model,
          system: SYSTEM_PROMPT,
          prompt,
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
      metadata: { kind: 'document_summary', fileName },
    });

    const summary = result.text.trim();
    if (summary.length === 0) {
      logger.warn(
        { fileName, orgId },
        'Summary LLM returned empty text, falling back to no summary',
      );
      return '';
    }

    logger.info(
      { fileName, orgId, summaryLength: summary.length },
      'Generated document summary',
    );
    return summary;
  } catch (err) {
    logger.warn(
      { err, fileName, orgId },
      'Document summary generation failed, continuing without summary',
    );
    return '';
  }
}
