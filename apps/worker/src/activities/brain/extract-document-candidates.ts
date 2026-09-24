import {
  assembleCandidates,
  ExtractionBudget,
  extractDocument,
  type GenerateStructured,
} from '@ragenai/brain-core';
import { generateObject, NoObjectGeneratedError, zodSchema } from 'ai';

import { BRAIN_EXTRACT_MODEL } from '../../consts.js';
import {
  getExtractionSource,
  recordExtractionFailed,
  replaceCandidatesFromFile,
  resolveExtractionFailed,
} from '../../services/db/brain.js';
import { db } from '../../services/db/db.js';
import { getChatModelForOrg } from '../../services/llm/provider.js';
import { logger } from '../../services/logger.js';
import { computeFileAccessPrincipals } from '../db/compute-file-access-principals.js';

/** Output cap per call — also what bounds a run's overshoot of its budget. */
const MAX_OUTPUT_TOKENS = 8_000;

export type ExtractDocumentCandidatesResult = {
  status: 'extracted' | 'failed' | 'budget_exhausted';
  pagesCreated: number;
  unverifiedClaims: number;
  tokens: number;
};

/**
 * Extract one document into candidate pages (spec B3).
 *
 * The rules are `brain-core`'s; this binds them to the gateway, the database
 * and the finding a failure raises. What it adds:
 *
 * - **The text is the active version's**, and so is the id every source is
 *   pinned to — see `getExtractionSource`.
 * - **A failure is a finding, never a failed run.** One document's bad answer
 *   raises `EXTRACTION_FAILED` for that document and the run carries on; a
 *   failed job run is not somewhere a curator looks. A success resolves the
 *   document's open finding, which is D3's "retry resolves it".
 * - **Nothing is logged with an error object.** An AI SDK error carries
 *   `requestBodyValues` — the document — and a structured logger copies it.
 *
 * `maxTokens` is what is left of the run's budget; the run's document count
 * is the handler's to enforce.
 */
export async function extractDocumentCandidates({
  orgId,
  fileId,
  userId,
  maxTokens,
  runId,
}: {
  orgId: string;
  fileId: string;
  userId?: string | null;
  maxTokens: number;
  runId: string;
}): Promise<ExtractDocumentCandidatesResult> {
  const source = await getExtractionSource(fileId, orgId);
  if (!source) {
    await recordExtractionFailed({
      orgId,
      fileId,
      detail: {
        reason: 'the document has no parsed text to extract from',
        windowIndex: null,
        runId,
      },
    });
    return {
      status: 'failed',
      pagesCreated: 0,
      unverifiedClaims: 0,
      tokens: 0,
    };
  }

  const model = await getChatModelForOrg(orgId, BRAIN_EXTRACT_MODEL);
  const generate: GenerateStructured = async ({ system, prompt, schema }) => {
    try {
      const result = await generateObject({
        model,
        schema: zodSchema(schema),
        system,
        prompt,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        experimental_telemetry: { isEnabled: true },
      });
      return {
        object: result.object,
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
        },
      };
    } catch (error) {
      // The SDK refused an answer that did not match the schema. Returned
      // rather than thrown so the tokens it cost are charged to the budget,
      // and so the retry is told which fields were wrong; the answer itself
      // is dropped, since it is the model's rendering of the document.
      if (NoObjectGeneratedError.isInstance(error)) {
        return {
          object: null,
          usage: {
            inputTokens: error.usage?.inputTokens ?? 0,
            outputTokens: error.usage?.outputTokens ?? 0,
          },
        };
      }
      throw error;
    }
  };

  const startedAt = Date.now();
  const outcome = await extractDocument({
    fileName: source.fileName,
    text: source.text,
    generate,
    budget: new ExtractionBudget({ maxDocuments: 1, maxTokens }),
  });
  const tokens = outcome.usage.inputTokens + outcome.usage.outputTokens;

  if (tokens > 0) {
    await db.trackAiUsage({
      organizationId: orgId,
      userId: userId ?? null,
      step: 'CHAT_COMPLETION',
      provider: 'litellm',
      model: BRAIN_EXTRACT_MODEL,
      inputTokens: outcome.usage.inputTokens,
      outputTokens: outcome.usage.outputTokens,
      totalTokens: tokens,
      durationMs: Date.now() - startedAt,
      metadata: { kind: 'brain_extract', fileId, runId },
    });
  }

  if (outcome.status === 'budget_exhausted') {
    logger.info({ orgId, fileId, runId }, 'brain extract: run budget reached');
    return {
      status: 'budget_exhausted',
      pagesCreated: 0,
      unverifiedClaims: 0,
      tokens,
    };
  }

  if (outcome.status === 'failed') {
    await recordExtractionFailed({
      orgId,
      fileId,
      detail: {
        reason: outcome.reason,
        windowIndex: outcome.windowIndex,
        runId,
      },
    });
    logger.warn(
      { orgId, fileId, runId, windowIndex: outcome.windowIndex },
      'brain extract: document failed, finding raised',
    );
    return { status: 'failed', pagesCreated: 0, unverifiedClaims: 0, tokens };
  }

  const principals = await computeFileAccessPrincipals(fileId, orgId);
  const assembled = assembleCandidates(
    {
      organizationId: orgId,
      fileId,
      documentVersionId: source.documentVersionId,
      text: source.text,
      principals,
    },
    outcome.windows,
  );
  const written = await replaceCandidatesFromFile({
    orgId,
    fileId,
    pages: assembled.pages,
    edges: assembled.edges,
  });
  await resolveExtractionFailed({ orgId, fileId });

  logger.info(
    {
      orgId,
      fileId,
      runId,
      pagesCreated: written.pagesCreated,
      pagesReplaced: written.pagesReplaced,
      unverifiedClaims: assembled.unverifiedClaims,
    },
    'brain extract: candidates written',
  );
  return {
    status: 'extracted',
    pagesCreated: written.pagesCreated,
    unverifiedClaims: assembled.unverifiedClaims,
    tokens,
  };
}
