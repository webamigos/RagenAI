import { CreditOperation } from '@/generated/prisma/client';

/**
 * Cost in credits per operation. Single-unit credits — same scale across
 * enrichment and scoring. Changes ship via deploy.
 */
export const CREDIT_COSTS: Record<CreditOperation, number> = {
  [CreditOperation.ENRICH_REJESTRIO]: 1,
  [CreditOperation.SCORE_LEAD_CRITERION]: 1,
  [CreditOperation.SCORE_LEAD_DISQUALIFIER]: 1,
  [CreditOperation.SCORE_LEAD_SINGLE_PROMPT]: 1,
};

/** Default trial allocation for new organizations. */
export const DEFAULT_TRIAL_CREDITS = 500;

/** Default monthly grant for paid plans without an override in plan.limits. */
export const DEFAULT_MONTHLY_CREDITS = 500;
