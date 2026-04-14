import type {
  Subscription,
  SubscriptionPlan,
} from '@/generated/prisma/browser';

export type SubscriptionDetails = Subscription & {
  subscriptionPlan: SubscriptionPlan | null;
};
