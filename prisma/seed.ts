/* eslint-disable no-console */

import Stripe from 'stripe';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  SubscriptionPlanStatus,
  SubscriptionPlanType,
} from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Stripe sync is optional: most local/self-hosted setups don't have Stripe
// credentials at all (cloud/subscriptions is deferred), and syncInternalPlans()
// below — the part every deployment actually needs — is pure DB work with no
// Stripe dependency. Only syncStripePlans() needs a real key, and skips itself
// gracefully when one isn't configured.
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const internalPlans = [
  {
    name: 'Free',
    type: SubscriptionPlanType.INTERNAL,
    status: SubscriptionPlanStatus.ACTIVE,
    limits: {},
    priceId: 'internal_free',
  },
  {
    name: 'Trial',
    type: SubscriptionPlanType.INTERNAL,
    status: SubscriptionPlanStatus.ACTIVE,
    limits: {},
    priceId: 'internal_trial',
  },
  {
    name: 'Enterprise',
    type: SubscriptionPlanType.INTERNAL,
    status: SubscriptionPlanStatus.ACTIVE,
    limits: {},
    priceId: 'internal_enterprise',
  },
  {
    name: 'Amigos',
    type: SubscriptionPlanType.INTERNAL,
    status: SubscriptionPlanStatus.ACTIVE,
    limits: {},
    priceId: 'internal_amigos',
  },
];

async function syncInternalPlans() {
  try {
    console.log('Syncing internal plans...');
    for (const plan of internalPlans) {
      const existingPlan = await prisma.subscriptionPlan.findFirst({
        where: {
          name: plan.name,
          type: plan.type,
        },
      });

      if (!existingPlan) {
        await prisma.subscriptionPlan.create({
          data: plan,
        });
        console.log(`Created plan: ${plan.name}`);
      } else {
        console.log(`Plan ${plan.name} already exists, skipping...`);
      }
    }
  } catch (error) {
    console.error('Error syncing internal plans:', error);
    throw error;
  }
}

async function syncStripePlans() {
  if (!stripe) {
    console.log('STRIPE_SECRET_KEY not set — skipping Stripe plan sync.');
    return;
  }
  try {
    console.log('Syncing Stripe plans...');
    const stripePrices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
    });

    // Get all active Stripe plans from database
    const existingStripePlans = await prisma.subscriptionPlan.findMany({
      where: {
        type: SubscriptionPlanType.STRIPE,
        status: SubscriptionPlanStatus.ACTIVE,
      },
    });

    const processedProductIds = new Set<string>();

    // Group prices by product ID to handle multiple prices for the same product
    const productPrices = new Map<string, Stripe.Price[]>();
    for (const price of stripePrices.data) {
      const product = price.product as Stripe.Product;
      if (!product.active) {continue;}

      processedProductIds.add(product.id);
      if (!productPrices.has(product.id)) {
        productPrices.set(product.id, []);
      }
      productPrices.get(product.id)?.push(price);
    }

    // Process each product once
    for (const [, prices] of productPrices) {
      const product = prices[0].product as Stripe.Product;
      const defaultPrice = prices[0]; // Use first price as default

      const existingPlan = await prisma.subscriptionPlan.findFirst({
        where: {
          productId: product.id,
        },
      });

      const planData = {
        name: product.name,
        type: SubscriptionPlanType.STRIPE,
        status: SubscriptionPlanStatus.ACTIVE,
        productId: product.id,
        priceId: defaultPrice.id,
        metadata: {
          price_type: defaultPrice.type,
          price_recurring: defaultPrice.recurring,
          available_prices: prices.map((p) => ({
            id: p.id,
            type: p.type,
            recurring: p.recurring,
          })),
          ...product.metadata,
        } as object,
        features: product.metadata.features ?? {},
        limits: product.metadata.limits ?? {},
        lastSyncedAt: new Date(),
      };

      if (!existingPlan) {
        await prisma.subscriptionPlan.create({ data: planData });
        console.log(`Created Stripe plan: ${planData.name}`);
      } else {
        await prisma.subscriptionPlan.update({
          where: { id: existingPlan.id },
          data: planData,
        });
        console.log(`Updated Stripe plan: ${planData.name}`);
      }
    }

    // Mark plans as deleted if they no longer exist in Stripe
    for (const plan of existingStripePlans) {
      if (plan.productId && !processedProductIds.has(plan.productId)) {
        await prisma.subscriptionPlan.update({
          where: { id: plan.id },
          data: { status: SubscriptionPlanStatus.DELETED },
        });
        console.log(`Marked plan as deleted: ${plan.name}`);
      }
    }
  } catch (error) {
    console.error('Error syncing Stripe plans:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('Seeding process started...');
    await syncInternalPlans();
    await syncStripePlans();
    console.log('Seeding finished.');
  } catch (error) {
    console.error('Error seeding default plans:', error);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
