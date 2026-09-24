/**
 * Which of an organization's subscription rows decides its plan features.
 *
 * The one copy. apps/web, apps/api and apps/admin each carried their own —
 * admin's a `find` that took whichever active row the database returned
 * first, so the panel could explain a resolution apps/web did not make — and
 * apps/worker needed one for Brain's run-time flag check. All four read this.
 * `tests/architecture/shared-contracts-are-not-recopied.test.ts` refuses a
 * fifth, and a second `TRIAL_PLAN_NAME`.
 *
 * An organization accumulates rows — a legacy trial beside a paid plan, stale
 * trials from invite flows — so the order is: an `active` paid plan, then a
 * `trialing` paid plan, then a `trialing` generic Trial, then anything else;
 * within a tier, the most recently started period.
 */
export const TRIAL_PLAN_NAME = 'Trial';

export type SubscriptionCandidate = {
  plan: string;
  status: string;
  periodStart: Date | null;
};

const TIER = {
  activePaid: 0,
  trialingPaid: 1,
  trialingTrial: 2,
  other: 3,
} as const;

function tierFor(candidate: SubscriptionCandidate): number {
  const isTrialPlan = candidate.plan === TRIAL_PLAN_NAME;
  if (candidate.status === 'active' && !isTrialPlan) {
    return TIER.activePaid;
  }
  if (candidate.status === 'trialing' && !isTrialPlan) {
    return TIER.trialingPaid;
  }
  if (candidate.status === 'trialing' && isTrialPlan) {
    return TIER.trialingTrial;
  }
  return TIER.other;
}

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
  })[0]!;
}

/**
 * Whether the chosen subscription's plan features apply at all. A trial is
 * entitled to its plan's features; a canceled or past-due one is not, and
 * the organization falls through to the platform and code defaults.
 */
export function subscriptionGrantsPlanFeatures(
  subscription: SubscriptionCandidate | null,
): subscription is SubscriptionCandidate {
  return (
    subscription !== null &&
    subscription.plan.length > 0 &&
    (subscription.status === 'active' || subscription.status === 'trialing')
  );
}
