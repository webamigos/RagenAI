import type { Plan, Subscription } from '@prisma/client';

export type SubscriptionDetails = Subscription & {
  plan: Plan;
};
