import {
  contradictionPairs,
  ExtractionBudget,
  judgeContradictions,
} from '@ragenai/brain-core';

import {
  BRAIN_CONTRADICTION_MAX_PAIRS,
  BRAIN_EXTRACT_MODEL,
} from '../../consts.js';
import {
  loadContradictionCandidates,
  recordContradictionJudgement,
} from '../../services/db/brain-contradictions.js';
import { db } from '../../services/db/db.js';
import { getChatModelForOrg } from '../../services/llm/provider.js';
import { logger } from '../../services/logger.js';
import { structuredGenerator } from './structured-generator.js';

export type DetectContradictionsResult = {
  pairs: number;
  raised: number;
  cleared: number;
  failed: number;
  /** Pairs the run's budget or the pair ceiling left unjudged. */
  notJudged: number;
  tokens: number;
};

/**
 * Compare the pages this run wrote with every other page about the same
 * subject, and record what contradicts (spec C1).
 *
 * The rules are `brain-core`'s — which pairs (`contradictionPairs`), how a
 * pair is judged and what of the answer is kept (`judgeContradictions`); this
 * binds them to the gateway, the budget and the database.
 *
 * - **The run's budget applies.** `maxTokens` is what extraction left, and
 *   `BRAIN_CONTRADICTION_MAX_PAIRS` bounds the calls. A pair not reached is
 *   counted, and judged by the next run that touches either page.
 * - **A pair that fails to be judged is counted, not raised.** It is not a
 *   finding about either page; logging it is enough, and the next run asks
 *   again.
 * - **Only counts leave.** The passages and the explanations are document
 *   text and stay in this process and in the finding.
 */
export async function detectContradictions(input: {
  orgId: string;
  fileIds: string[];
  userId?: string | null;
  maxTokens: number;
  runId: string;
}): Promise<DetectContradictionsResult> {
  const result: DetectContradictionsResult = {
    pairs: 0,
    raised: 0,
    cleared: 0,
    failed: 0,
    notJudged: 0,
    tokens: 0,
  };
  const { pages, touched } = await loadContradictionCandidates(
    input.orgId,
    input.fileIds,
  );
  const pairs = contradictionPairs(pages, touched);
  result.pairs = pairs.length;
  if (pairs.length === 0) {
    return result;
  }

  const byId = new Map(pages.map((p) => [p.id, p]));
  const generate = structuredGenerator(
    await getChatModelForOrg(input.orgId, BRAIN_EXTRACT_MODEL),
  );
  const budget = new ExtractionBudget({
    maxDocuments: BRAIN_CONTRADICTION_MAX_PAIRS,
    maxTokens: input.maxTokens,
  });
  const usage = { inputTokens: 0, outputTokens: 0 };
  const startedAt = Date.now();

  // Usage is recorded however the loop ends: a database error half-way
  // through has still spent what it spent.
  try {
    for (const [aId, bId] of pairs) {
      const a = byId.get(aId)!;
      const b = byId.get(bId)!;
      const outcome = await judgeContradictions({
        a: a.judged,
        b: b.judged,
        generate,
        budget,
      });
      usage.inputTokens += outcome.usage.inputTokens;
      usage.outputTokens += outcome.usage.outputTokens;

      if (outcome.status === 'budget_exhausted') {
        result.notJudged += 1;
        continue;
      }
      if (outcome.status === 'failed') {
        result.failed += 1;
        logger.warn(
          { orgId: input.orgId, runId: input.runId, pageIds: [aId, bId] },
          'brain contradictions: pair not judged',
        );
        continue;
      }
      const written = await recordContradictionJudgement({
        orgId: input.orgId,
        pageIds: [aId, bId],
        contradictions: outcome.contradictions,
        truncated: outcome.truncated,
        published: a.published || b.published,
        runId: input.runId,
      });
      if (written === 'raised') {
        result.raised += 1;
      } else if (written === 'cleared') {
        result.cleared += 1;
      }
    }
  } finally {
    result.tokens = usage.inputTokens + usage.outputTokens;
    if (result.tokens > 0) {
      await db.trackAiUsage({
        organizationId: input.orgId,
        userId: input.userId ?? null,
        step: 'CHAT_COMPLETION',
        provider: 'litellm',
        model: BRAIN_EXTRACT_MODEL,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: result.tokens,
        durationMs: Date.now() - startedAt,
        metadata: { kind: 'brain_contradictions', runId: input.runId },
      });
    }
  }
  logger.info(
    { orgId: input.orgId, runId: input.runId, ...result },
    'brain contradictions: pairs judged',
  );
  return result;
}
