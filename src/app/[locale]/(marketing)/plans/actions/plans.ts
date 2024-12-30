'use server';

import { PlanStatus, PlanType, SubscriptionStatus } from '@prisma/client';
import prisma from '@ragenai/prisma-client';
import { fetchStripePlans } from '@/app/lib/services/stripe';
import { auth } from '@clerk/nextjs/server';

export async function fetchAvailablePlans() {
  const plans = await prisma.plan.findMany({
    where: {
      status: PlanStatus.ACTIVE,
      type: PlanType.STRIPE,
    },
  });

  const stripePlans = await fetchStripePlans();

  const filteredStripePlans = stripePlans.filter((stripePlan) =>
    plans.some((plan) => plan.stripe_price_id === stripePlan.id)
  );

  return filteredStripePlans;
}

export async function checkIfStripeSubscriptionIsActive() {
  const { orgId } = auth();

  if (!orgId) {
    return false;
  }

  const organization = await prisma.organization.findUnique({
    where: { provider_id: orgId },
    select: {
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  const organizationSubscription = organization?.subscription;

  if (!organizationSubscription) {
    return false;
  }

  const subscriptionIsActive =
    organizationSubscription.status === SubscriptionStatus.ACTIVE &&
    organizationSubscription.plan.type === PlanType.STRIPE;

  return subscriptionIsActive;
}
