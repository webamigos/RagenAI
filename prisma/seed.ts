/* eslint-disable no-console */

import Stripe from 'stripe';
import { PlanStatus, PlanType, PrismaClient } from '@prisma/client';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}
const stripe = new Stripe(stripeSecretKey);

const prisma = new PrismaClient();

const internalPlans = [
  {
    name: 'Free',
    type: PlanType.INTERNAL,
    status: PlanStatus.ACTIVE,
    features: {},
    limits: {},
  },
  {
    name: 'Trial',
    type: PlanType.INTERNAL,
    status: PlanStatus.ACTIVE,
    features: {},
    limits: {},
  },
  {
    name: 'Enterprise',
    type: PlanType.INTERNAL,
    status: PlanStatus.ACTIVE,
    features: {},
    limits: {},
  },
  {
    name: 'Amigos',
    type: PlanType.INTERNAL,
    status: PlanStatus.ACTIVE,
    features: {},
    limits: {},
  },
];

async function syncInternalPlans() {
  try {
    console.log('Syncing internal plans...');
    for (const plan of internalPlans) {
      const existingPlan = await prisma.plan.findFirst({
        where: {
          name: plan.name,
          type: plan.type,
        },
      });

      if (!existingPlan) {
        await prisma.plan.create({
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
  try {
    console.log('Syncing Stripe plans...');
    const stripePrices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
    });

    // Get all active Stripe plans from database
    const existingStripePlans = await prisma.plan.findMany({
      where: {
        type: PlanType.STRIPE,
        status: PlanStatus.ACTIVE,
      },
    });

    const processedProductIds = new Set<string>();

    // Group prices by product ID to handle multiple prices for the same product, multiple prices not supported for now
    const productPrices = new Map<string, Stripe.Price[]>();
    for (const price of stripePrices.data) {
      const product = price.product as Stripe.Product;
      if (!product.active) continue;

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

      const existingPlan = await prisma.plan.findFirst({
        where: {
          stripe_product_id: product.id,
        },
      });

      const planData = {
        name: product.name,
        type: PlanType.STRIPE,
        status: PlanStatus.ACTIVE,
        stripe_product_id: product.id,
        stripe_price_id: defaultPrice.id,
        stripe_metadata: {
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
        last_synced_at: new Date(),
      };

      if (!existingPlan) {
        await prisma.plan.create({ data: planData });
        console.log(`Created Stripe plan: ${planData.name}`);
      } else {
        await prisma.plan.update({
          where: { id: existingPlan.id },
          data: planData,
        });
        console.log(`Updated Stripe plan: ${planData.name}`);
      }
    }

    // Mark plans as deleted if they no longer exist in Stripe
    for (const plan of existingStripePlans) {
      if (
        plan.stripe_product_id &&
        !processedProductIds.has(plan.stripe_product_id)
      ) {
        await prisma.plan.update({
          where: { id: plan.id },
          data: { status: PlanStatus.DELETED },
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
