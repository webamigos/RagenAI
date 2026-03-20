'use server';

import { prisma } from '@/lib/db';
import { stripe } from '@/lib/stripe';
import { revalidatePath } from 'next/cache';

export async function syncPlansFromStripeAction() {
  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price'],
    limit: 100,
  });

  let synced = 0;

  for (const product of products.data) {
    const defaultPrice = product.default_price;
    if (!defaultPrice || typeof defaultPrice === 'string') {
      continue;
    }

    const existing = await prisma.subscriptionPlan.findUnique({
      where: { productId: product.id },
    });

    const limits = product.metadata?.limits
      ? JSON.parse(product.metadata.limits)
      : {};

    const features = product.metadata?.features
      ? JSON.parse(product.metadata.features)
      : undefined;

    const metadata = product.metadata || undefined;

    if (existing) {
      await prisma.subscriptionPlan.update({
        where: { productId: product.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          name: product.name,
          priceId: defaultPrice.id,
          type: 'STRIPE',
          status: 'ACTIVE',
          limits: JSON.parse(JSON.stringify(limits)),
          features: features ? JSON.parse(JSON.stringify(features)) : undefined,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
          lastSyncedAt: new Date(),
        } as any,
      });
    } else {
      await prisma.subscriptionPlan.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          name: product.name,
          priceId: defaultPrice.id,
          productId: product.id,
          type: 'STRIPE',
          status: 'ACTIVE',
          limits: JSON.parse(JSON.stringify(limits)),
          features: features ? JSON.parse(JSON.stringify(features)) : undefined,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
          lastSyncedAt: new Date(),
        } as any,
      });
    }

    synced++;
  }

  revalidatePath('/subscriptions/plans');

  return { synced };
}
