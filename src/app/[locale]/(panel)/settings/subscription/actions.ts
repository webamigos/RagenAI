'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getSubscriptionDetailsQuery } from '@/features/subscriptions/services/queries/get-subscription-details';
import { cancelSubscriptionCommand } from '@/features/subscriptions/services/commands/cancel-subscription';
import { activateFreePlanCommand } from '@/features/subscriptions/services/commands/activate-free-plan';
import type { SubscriptionDetails } from './types';

export async function getSubscriptionData(): Promise<SubscriptionDetails | null> {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    return null;
  }

  const result = await getSubscriptionDetailsQuery(orgId);

  if (!result.success || !result.data) {
    return null;
  }

  return result.data;
}

export async function cancelSubscription(
  stripeSubscriptionId: string | null
): Promise<{ canceledAt: Date | null } | null> {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId || !stripeSubscriptionId) {
    return null;
  }

  const result = await cancelSubscriptionCommand(stripeSubscriptionId);

  if (!result.success) {
    return null;
  }

  return result.data ?? null;
}

export async function activateInternalFreePlan() {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    throw new Error('Cannot activate free plan, no organization id found');
  }

  const result = await activateFreePlanCommand(orgId);

  if (!result.success) {
    throw new Error(result.error ?? 'Failed to activate free plan');
  }
}
