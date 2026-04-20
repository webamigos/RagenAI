import db from '@ragenai/prisma-client';
import { getStripe } from '@/libs/payments/stripe';
import pino from 'pino';

const logger = pino({ name: 'sync-seats' });

/**
 * Syncs the member count of an organization to the Stripe subscription quantity.
 * This enables per-seat billing — Stripe calculates the charge based on quantity.
 *
 * Call this after a member is added or removed from an organization.
 * Safe to call even if the subscription is not per-seat (Stripe ignores quantity
 * for flat-rate prices).
 */
export async function syncSeatsToStripe(organizationId: string): Promise<void> {
  try {
    const subscription = await db.subscription.findFirst({
      where: {
        referenceId: organizationId,
        status: { in: ['active', 'trialing'] },
      },
    });

    if (!subscription?.stripeSubscriptionId) {
      return;
    }

    const memberCount = await db.member.count({
      where: { organizationId },
    });

    if (memberCount < 1) {
      return;
    }

    const stripeClient = getStripe();

    if (stripeClient) {
      // Update Stripe subscription quantity
      const stripeSub = await stripeClient.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
      );

      if (stripeSub.items.data.length) {
        const item = stripeSub.items.data[0];
        const currentQuantity = item.quantity ?? 1;

        if (currentQuantity !== memberCount) {
          await stripeClient.subscriptions.update(
            subscription.stripeSubscriptionId,
            {
              items: [
                {
                  id: item.id,
                  quantity: memberCount,
                },
              ],
              proration_behavior: 'create_prorations',
            },
          );

          logger.info(
            {
              organizationId,
              previousSeats: currentQuantity,
              newSeats: memberCount,
            },
            'Synced seats to Stripe',
          );
        }
      }
    }

    // Always update local seats field
    await db.subscription.update({
      where: { id: subscription.id },
      data: { seats: memberCount },
    });
  } catch (error) {
    // Non-blocking — don't break member operations if Stripe sync fails
    logger.error(
      { err: error, organizationId },
      'Failed to sync seats to Stripe',
    );
  }
}
