/**
 * The monthly usage ceilings, evaluated once (spec
 * 2026-09-27-personal-memory-across-threads, B1).
 *
 * apps/web (`check-usage-limits-query.ts`) and apps/api
 * (`api-limits.service.ts`) each carried this arithmetic, with a comment in
 * both saying the two had to agree. The worker is about to need it too —
 * memory extraction must check the org's ceiling before its model call ("a
 * limit is a call site", AGENTS.md) — so it lives here, and each app keeps
 * only its own Prisma read.
 *
 * Two rules that are easy to get wrong, and why this is shared:
 *
 * - **Spend counts every step.** Embeddings, reranking and extraction cost
 *   money, so tokens and cost aggregate all `AiUsage` rows.
 * - **The message ceiling counts chat turns only** (`CHAT_TURN_STEP`). One
 *   ingest writes a row per embedded chunk; counting those would refuse chats
 *   because somebody uploaded a PDF.
 */

/** The `AiUsage.step` a message ceiling counts. */
export const CHAT_TURN_STEP = 'CHAT_COMPLETION';

/** The ceilings, as stored; null means no limit. */
export type MonthlyCeilings = {
  monthlyTokenLimit: number | null;
  monthlyCostLimitCents: number | null;
  monthlyMessageLimit: number | null;
};

/** What the organization used this month, as the apps read it. */
export type MonthlyUsage = {
  totalTokens: number | null | undefined;
  /** `AiUsage.estimatedCost` summed: dollars, not cents. */
  totalCostDollars: number | null | undefined;
  chatMessages: number;
};

export type CeilingDimension = 'tokens' | 'cost' | 'messages';

export type CeilingEvaluation = {
  exceeded: CeilingDimension[];
  current: {
    totalTokens: number;
    totalCostCents: number;
    totalMessages: number;
  };
};

/** The start of the current billing month: the first, at 00:00 UTC. */
export function usageMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Which ceilings the usage has reached. A ceiling is reached at the limit,
 * not past it: an org with a 100-message limit gets no 101st turn.
 */
export function evaluateCeilings(
  limits: MonthlyCeilings,
  usage: MonthlyUsage,
): CeilingEvaluation {
  const totalTokens = usage.totalTokens ?? 0;
  const totalCostCents = Math.round((usage.totalCostDollars ?? 0) * 100);
  const totalMessages = usage.chatMessages;

  const exceeded: CeilingDimension[] = [];
  if (
    limits.monthlyTokenLimit !== null &&
    totalTokens >= limits.monthlyTokenLimit
  ) {
    exceeded.push('tokens');
  }
  if (
    limits.monthlyCostLimitCents !== null &&
    totalCostCents >= limits.monthlyCostLimitCents
  ) {
    exceeded.push('cost');
  }
  if (
    limits.monthlyMessageLimit !== null &&
    totalMessages >= limits.monthlyMessageLimit
  ) {
    exceeded.push('messages');
  }

  return {
    exceeded,
    current: { totalTokens, totalCostCents, totalMessages },
  };
}
