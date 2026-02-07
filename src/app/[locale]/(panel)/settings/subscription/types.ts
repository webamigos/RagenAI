import type { Plan, Subscription } from '@/generated/prisma/client';

export type SubscriptionDetails = Subscription & {
  plan: Plan;
};
