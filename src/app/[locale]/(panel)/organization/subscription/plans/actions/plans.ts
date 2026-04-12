'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getAvailablePlansQuery } from '@/features/subscriptions/services/queries/get-available-plans';
import { checkActiveSubscriptionQuery } from '@/features/subscriptions/services/queries/check-active-subscription';
import type { SubscriptionPlan } from '@/generated/prisma/client';

export async function fetchAvailablePlans(): Promise<SubscriptionPlan[]> {
  const result = await getAvailablePlansQuery();

  if (!result.success || !result.data) {
    return [];
  }

  return result.data;
}

export async function checkIfStripeSubscriptionIsActive() {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    return false;
  }

  const result = await checkActiveSubscriptionQuery(orgId);

  return result.success && result.data === true;
}
