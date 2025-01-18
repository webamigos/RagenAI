import { PlanStatus, SubscriptionStatus } from '@prisma/client';
import { PlanType } from '@prisma/client';
import db from '@ragenai/prisma-client';

const TRIAL_DAYS = 14;
const TRIAL_PLAN_NAME = 'Trial';
const FREE_PLAN_NAME = 'Free';
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
