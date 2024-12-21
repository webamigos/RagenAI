'use server';

import { PlanStatus, PlanType } from '@prisma/client';
import prisma from '@ragenai/prisma-client';
import { stripe } from '@/libs/payments/stripe';
import Stripe from 'stripe';
import { StripePlan } from '../types/plan';
import { logger } from '@/app/lib/utils/logger';

export async function fetchAvailablePlans() {
  const plans = await prisma.plan.findMany({
    where: {
      status: PlanStatus.ACTIVE,
      type: PlanType.STRIPE,
    },
  });

  const stripePlans = (await stripe.prices.list({
    active: true,
    expand: ['data.product'],
  })) as Stripe.Response<Stripe.ApiList<StripePlan>>;

  const filteredStripePlans = stripePlans.data.filter((stripePlan) =>
    plans.some((plan) => plan.stripe_price_id === stripePlan.id)
  );

  return filteredStripePlans;
}

export async function handleSubscribe(planId: string) {
  logger.info(`Plan ID: ${planId}`);
}
