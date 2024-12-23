'use server';

import { PlanStatus, PlanType } from '@prisma/client';
import prisma from '@ragenai/prisma-client';
import { fetchStripePlans } from '@/app/lib/services/stripe';

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
