'use server';

import { auth } from '@clerk/nextjs/server';

import db from '@ragenai/prisma-client';

import type { SubscriptionDetails } from './types';

export async function getSubscriptionData(): Promise<SubscriptionDetails | null> {
  const { orgId } = auth();

  if (!orgId) {
    return null;
  }

  const organization = await db.organization.findFirst({
    where: {
      provider_id: orgId,
    },
    select: {
      subscription: {
        include: {
          plan: true,
        },
      },
    },
  });

  return organization?.subscription ?? null;
}
