import { TRIAL_PLAN_NAME } from '@/app/config';

export type SubscriptionCandidate = {
  plan: string;
  status: string;
  periodStart: Date | null;
};

const SUBSCRIPTION_TIER_ORDER = {
  active_paid: 0,
  trialing_paid: 1,
  trialing_trial: 2,
  other: 3,
} as const;

function tierFor(candidate: SubscriptionCandidate): number {
  const isTrialPlan = candidate.plan === TRIAL_PLAN_NAME;
  if (candidate.status === 'active' && !isTrialPlan) {
    return SUBSCRIPTION_TIER_ORDER.active_paid;
  }
  if (candidate.status === 'trialing' && !isTrialPlan) {
    return SUBSCRIPTION_TIER_ORDER.trialing_paid;
  }
  if (candidate.status === 'trialing' && isTrialPlan) {
    return SUBSCRIPTION_TIER_ORDER.trialing_trial;
  }
  return SUBSCRIPTION_TIER_ORDER.other;
}

/**
 * Pick the "best" subscription for an org from possibly many rows.
 * Active paid > trialing paid > trialing Trial > anything else.
 * Ties broken by most recent periodStart.
 */
export function pickBestSubscription<T extends SubscriptionCandidate>(
  candidates: T[],
): T | null {
  if (candidates.length === 0) {
    return null;
  }
  return [...candidates].sort((a, b) => {
    const tierDiff = tierFor(a) - tierFor(b);
    if (tierDiff !== 0) {
      return tierDiff;
    }
    const aStart = a.periodStart ? a.periodStart.getTime() : 0;
    const bStart = b.periodStart ? b.periodStart.getTime() : 0;
    return bStart - aStart;
  })[0];
}
