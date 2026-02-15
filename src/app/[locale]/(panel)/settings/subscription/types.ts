import type { Subscription, SubscriptionPlan } from '@/generated/prisma/client';

export type SubscriptionDetails = Subscription & {
  subscriptionPlan: SubscriptionPlan | null;
};
