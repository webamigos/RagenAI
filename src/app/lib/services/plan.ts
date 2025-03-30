import { PlanStatus, SubscriptionStatus, Subscription } from '@prisma/client';
import { PlanType } from '@prisma/client';
import db from '@ragenai/prisma-client';
import Stripe from 'stripe';
import { logger } from '../utils/logger';
import { cancelSubscription } from '@/app/lib/services/stripe';
import { FREE_PLAN_NAME, TRIAL_DAYS, TRIAL_PLAN_NAME } from '@/app/config';

const FOREVER_DATE = new Date(new Date().setFullYear(2099, 11, 31));

export async function createTrialSubscription(providerId: string) {
  const trialPlan = await db.plan.findFirst({
    where: {
      name: TRIAL_PLAN_NAME,
      type: PlanType.INTERNAL,
      status: PlanStatus.ACTIVE,
    },
  });

  if (!trialPlan) {
    throw new Error('Trial plan not found');
  }

  const now = new Date();
  const trialEnd = new Date(now.setDate(now.getDate() + TRIAL_DAYS));

  const organization = await db.organization.findFirst({
    where: {
      provider_id: providerId,
    },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  return db.subscription.create({
    data: {
      organization_id: organization.id,
      plan_id: trialPlan.id,
      status: SubscriptionStatus.ACTIVE,
      current_period_start: new Date(),
      current_period_end: trialEnd,
      trial_end: trialEnd,
    },
    include: {
      plan: true,
    },
  });
}

export async function activateFreePlan(providerId: string) {
  const freePlan = await db.plan.findFirst({
    where: {
      name: FREE_PLAN_NAME,
      type: PlanType.INTERNAL,
      status: PlanStatus.ACTIVE,
    },
  });

  if (!freePlan) {
    throw new Error('Free plan not found');
  }

  const organization = await db.organization.findFirst({
    where: {
      provider_id: providerId,
    },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  // First try to update existing subscription
  const existingSubscription = await db.subscription.findFirst({
    where: {
      organization_id: organization.id,
    },
  });

  if (existingSubscription) {
    // Update existing subscription
    return db.subscription.update({
      where: {
        id: existingSubscription.id,
      },
      data: {
        plan_id: freePlan.id,
        status: SubscriptionStatus.ACTIVE,
        current_period_start: new Date(),
        current_period_end: FOREVER_DATE,
        trial_end: null,
        canceled_at: null,
      },
      include: {
        plan: true,
      },
    });
  }

  // Create new subscription if none exists
  return db.subscription.create({
    data: {
      organization_id: organization.id,
      plan_id: freePlan.id,
      status: SubscriptionStatus.ACTIVE,
      current_period_start: new Date(),
      current_period_end: new Date(new Date().setFullYear(2099, 11, 31)),
      trial_end: null,
    },
    include: {
      plan: true,
    },
  });
}

export async function checkIfOrganizationPlanIsExpired(organizationId: string) {
  const organization = await db.organization.findFirst({
    where: {
      provider_id: organizationId,
    },
    select: {
      id: true,
      provider_id: true,
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  let isExpired = false;
  const subscription = organization?.subscription;
  if (!subscription) {
    return isExpired;
  }

  if (subscription.plan.name === TRIAL_PLAN_NAME) {
    isExpired =
      subscription.current_period_end &&
      subscription.current_period_end < new Date();
  }

  return isExpired;
}

export async function createPaidSubscription(
  data: Stripe.Subscription,
  organizationId: string
) {
  const hasSubscription = await checkIfOrganizationHasSubscription(
    organizationId
  );
  const subscriptionData = await extractSubscriptionData(organizationId, data);

  if (hasSubscription?.stripe_subscription_id) {
    try {
      logger.info(
        `Canceling subscription: ${hasSubscription.stripe_subscription_id}`
      );
      await cancelSubscription(hasSubscription.stripe_subscription_id!);
    } catch (error) {
      logger.error(`Error canceling subscription: ${error}`);
    }
  }

  if (hasSubscription) {
    return db.subscription.update({
      where: {
        id: hasSubscription.id,
      },
      data: subscriptionData,
    });
  }

  return db.subscription.create({
    data: subscriptionData,
  });
}

export async function updatePaidSubscription(data: Stripe.Subscription) {
  const subscriptionId = data.id;
  const subscription = await db.subscription.findFirst({
    where: {
      stripe_subscription_id: subscriptionId,
    },
    include: {
      organization: true,
    },
  });

  if (!subscription) {
    logger.info(`Subscription not found: ${subscriptionId}`);
    return;
  }

  const subscriptionData = await extractSubscriptionData(
    subscription.organization.provider_id,
    data
  );
  return db.subscription.update({
    where: {
      id: subscription.id,
    },
    data: subscriptionData,
  });
}

export async function extractSubscriptionData(
  organizationId: string,
  data: Stripe.Subscription
): Promise<Omit<Subscription, 'id' | 'created_at' | 'updated_at'>> {
  const customerId = data.customer as string;
  const subscriptionId = data.id;
  const currentPeriodEnd = data.current_period_end;
  const currentPeriodStart = data.current_period_start;
  const canclelledAt = data.canceled_at;
  const trialEnd = data.trial_end;

  const items = data.items.data;
  const priceId = items[0].price.id;
  const status = data.status?.toUpperCase() as SubscriptionStatus;

  const organization = await db.organization.findFirst({
    where: {
      provider_id: organizationId,
    },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  const internalPlan = await db.plan.findFirst({
    where: {
      stripe_price_id: priceId,
      status: PlanStatus.ACTIVE,
    },
  });

  if (!internalPlan) {
    throw new Error('Plan not found');
  }

  return {
    organization_id: organization.id,
    plan_id: internalPlan.id,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    canceled_at: canclelledAt ? new Date(canclelledAt * 1000) : null,
    current_period_end: new Date(currentPeriodEnd * 1000),
    current_period_start: new Date(currentPeriodStart * 1000),
    trial_end: trialEnd ? new Date(trialEnd * 1000) : null,
    status: status,
  };
}

export async function handleSubscriptionDelete(data: Stripe.Subscription) {
  const subscriptionId = data.id;
  const subscription = await db.subscription.findFirst({
    where: {
      stripe_subscription_id: subscriptionId,
    },
    include: {
      organization: true,
    },
  });

  if (!subscription) {
    logger.info(`Subscription not found: ${subscriptionId}`);
    return;
  }

  await activateFreePlan(subscription.organization.provider_id);
}

async function checkIfOrganizationHasSubscription(
  organizationId: string
): Promise<Subscription | null> {
  const organization = await db.organization.findFirst({
    where: {
      provider_id: organizationId,
    },
    select: {
      subscription: true,
    },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  return organization.subscription;
}
