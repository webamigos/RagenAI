import {
  assembleCandidates,
  ExtractionBudget,
  extractDocument,
  type AssembledCandidates,
} from '@ragenai/brain-core';

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
import { structuredGenerator } from './structured-generator.js';

export type ExtractDocumentCandidatesResult = {
  status: 'extracted' | 'failed' | 'budget_exhausted';
  pagesCreated: number;
  unverifiedClaims: number;
  tokens: number;
};

/**
 * The first half of `extractDocumentCandidates`, with no writes: read the
 * document's active version, run extraction through the gateway, record the
 * usage, assemble candidates.
 *
 * Split out so B5's preview script runs **this** — the path the job runs —
 * rather than a lookalike. A preview that exercises a different path than
 * production has no oracle, and a wrong answer from it gets blamed on the
 * model. Returns the candidates in memory; they carry document text, so they
 * never leave the process as a step result.
 */
export type ExtractFileResult =
  | {
      status: 'extracted';
      tokens: number;
      source: { fileName: string; documentVersionId: string };
      assembled: AssembledCandidates;
      /** Items the model returned that failed their limits. */
      rejectedItems: number;
    }
  | {
      status: 'failed';
      tokens: number;
      reason: string;
      windowIndex: number | null;
    }
  | { status: 'budget_exhausted'; tokens: number };

export async function extractFile({
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
}): Promise<ExtractFileResult> {
  const source = await getExtractionSource(fileId, orgId);
  if (!source) {
    return {
      status: 'failed',
      tokens: 0,
      reason: 'the document has no parsed text to extract from',
      windowIndex: null,
    };
  }

  const generate = structuredGenerator(
    await getChatModelForOrg(orgId, BRAIN_EXTRACT_MODEL),
  );

  const startedAt = Date.now();
  const outcome = await extractDocument({
    fileName: source.fileName,
    text: source.text,
    language: source.language,
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
    return { status: 'budget_exhausted', tokens };
  }
  if (outcome.status === 'failed') {
    return {
      status: 'failed',
      tokens,
      reason: outcome.reason,
      windowIndex: outcome.windowIndex,
    };
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
  return {
    status: 'extracted',
    tokens,
    source: {
      fileName: source.fileName,
      documentVersionId: source.documentVersionId,
    },
    assembled,
    rejectedItems: outcome.rejectedItems,
  };
}

/**
 * Extract one document into candidate pages (spec B3).
 *
 * The rules are `brain-core`'s; `extractFile` binds them to the gateway, and
 * this adds the writes and the finding a failure raises:
 *
 * - **The text is the active version's**, and so is the id every source is
 *   pinned to — see `getExtractionSource`.
 * - **A failure is a finding, never a failed run.** One document's bad answer
 *   raises `EXTRACTION_FAILED` for that document and the run carries on; a
 *   failed job run is not somewhere a curator looks. A success resolves the
 *   document's open finding, which is D3's "retry resolves it".
 * - **Nothing is logged with an error object.** An AI SDK error carries
 *   `requestBodyValues` — the document — and a structured logger copies it.
 * - **Only counts leave.** The result crosses the job runtime (Redis, or
 *   Temporal history); the candidates carry document text and stay here.
 *
 * `maxTokens` is what is left of the run's budget; the run's document count
 * is the handler's to enforce.
 */
export async function extractDocumentCandidates(input: {
  orgId: string;
  fileId: string;
  userId?: string | null;
  maxTokens: number;
  runId: string;
}): Promise<ExtractDocumentCandidatesResult> {
  return persistExtraction(input, await extractFile(input));
}

/**
 * The second half: what `extractFile`'s result does to the database — the
 * candidates written, or the finding raised. Exported for the preview
 * script's `--write`, so it persists by the job's code rather than its own.
 */
export async function persistExtraction(
  { orgId, fileId, runId }: { orgId: string; fileId: string; runId: string },
  result: ExtractFileResult,
): Promise<ExtractDocumentCandidatesResult> {
  if (result.status === 'budget_exhausted') {
    logger.info({ orgId, fileId, runId }, 'brain extract: run budget reached');
    return {
      status: 'budget_exhausted',
      pagesCreated: 0,
      unverifiedClaims: 0,
      tokens: result.tokens,
    };
  }

  if (result.status === 'failed') {
    await recordExtractionFailed({
      orgId,
      fileId,
      detail: {
        reason: result.reason,
        windowIndex: result.windowIndex,
        runId,
      },
    });
    logger.warn(
      { orgId, fileId, runId, windowIndex: result.windowIndex },
      'brain extract: document failed, finding raised',
    );
    return {
      status: 'failed',
      pagesCreated: 0,
      unverifiedClaims: 0,
      tokens: result.tokens,
    };
  }

  const written = await replaceCandidatesFromFile({
    orgId,
    fileId,
    pages: result.assembled.pages,
    edges: result.assembled.edges,
  });
  await resolveExtractionFailed({ orgId, fileId });

  logger.info(
    {
      orgId,
      fileId,
      runId,
      pagesCreated: written.pagesCreated,
      pagesReplaced: written.pagesReplaced,
      unverifiedClaims: result.assembled.unverifiedClaims,
    },
    'brain extract: candidates written',
  );
  return {
    status: 'extracted',
    pagesCreated: written.pagesCreated,
    unverifiedClaims: result.assembled.unverifiedClaims,
    tokens: result.tokens,
  };
}

/**
 * Raise `EXTRACTION_FAILED` for a document whose extraction *step* failed —
 * threw through all of its retries, as opposed to returning `failed`.
 *
 * `extractDocumentCandidates` turns every failure it can see into a finding,
 * but some happen before it can: no route for the extraction model, the
 * database refusing a read. Without this the handler would rethrow, and one
 * such document would fail the whole run — the one thing the spec says a
 * document's failure never does. `reason` is the handler's reduction of the
 * error to its class name, for the same reason `describeFailure` gives.
 */
export async function recordExtractionStepFailed(input: {
  orgId: string;
  fileId: string;
  runId: string;
  reason: string;
}): Promise<void> {
  await recordExtractionFailed({
    orgId: input.orgId,
    fileId: input.fileId,
    detail: { reason: input.reason, windowIndex: null, runId: input.runId },
  });
  logger.warn(
    { orgId: input.orgId, fileId: input.fileId, runId: input.runId },
    'brain extract: extraction step failed, finding raised',
  );
}
