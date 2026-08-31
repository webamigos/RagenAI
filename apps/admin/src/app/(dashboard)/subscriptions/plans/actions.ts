'use server';

import { prisma } from '@/lib/db';
import { requireStripe } from '@/lib/stripe';
import { revalidatePath } from 'next/cache';

export async function syncPlansFromStripeAction() {
  const stripe = requireStripe();
  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price'],
    limit: 100,
  });

  let synced = 0;
  const syncedProductIds: string[] = [];

  for (const product of products.data) {
    const defaultPrice = product.default_price;
    if (!defaultPrice || typeof defaultPrice === 'string') {
      continue;
    }

    syncedProductIds.push(product.id);

    const existing = await prisma.subscriptionPlan.findUnique({
      where: { productId: product.id },
    });

    let limits = {};
    try {
      if (product.metadata?.limits) {
        limits = JSON.parse(product.metadata.limits);
      }
    } catch {
      // Skip malformed JSON, use empty defaults
    }

    let features;
    try {
      if (product.metadata?.features) {
        features = JSON.parse(product.metadata.features);
      }
    } catch {
      // Skip malformed JSON
    }

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

  // Deactivate Stripe-backed plans that are no longer active in Stripe
  if (syncedProductIds.length > 0) {
    await prisma.subscriptionPlan.updateMany({
      where: {
        type: 'STRIPE',
        productId: { notIn: syncedProductIds },
        status: 'ACTIVE',
      },
      data: { status: 'ARCHIVED' },
    });
  }

  revalidatePath('/subscriptions/plans');

  return { synced };
}
