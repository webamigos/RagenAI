import type { Stripe } from 'stripe';
import { NextResponse } from 'next/server';
import { logger } from '@/app/lib/utils/logger';
import { stripe } from '@/libs/payments/stripe';
import {
  createPaidSubscription,
  updatePaidSubscription,
  handleSubscriptionDelete,
} from '@/app/lib/services/plan';

export async function POST(req: Request) {
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      await (await req.blob()).text(),
      req.headers.get('stripe-signature') as string,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    if (err! instanceof Error) logger.error(err);
    logger.error(`Error message: ${errorMessage}`);
    return NextResponse.json(
      { message: `Webhook Error: ${errorMessage}` },
      { status: 400 }
    );
  }

  const permittedEvents: string[] = [
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.upcoming',
  ];

  if (permittedEvents.includes(event.type)) {
    let data;
    logger.info(`Started processing stripe event: ${event.type}`);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          data = event.data.object as Stripe.Checkout.Session;
          logger.info(`Checkout session completed: ${data.status}`);
          if (data.subscription && data.client_reference_id) {
            const subscription = await stripe.subscriptions.retrieve(
              data.subscription as string
            );
            await createPaidSubscription(
              subscription,
              data.client_reference_id
            );
          }
          break;

        case 'customer.subscription.updated':
          data = event.data.object as Stripe.Subscription;
          logger.info(`Subscription updated: ${data.status}`);
          await updatePaidSubscription(data);
          break;

        case 'customer.subscription.deleted':
          //This is triggered when customer subscription ends
          //Todo:
          // * inform user by e-mail
          data = event.data.object as Stripe.Subscription;
          await handleSubscriptionDelete(data);
          break;

        case 'invoice.upcoming':
          //Sent a few days prior to the renewal of the subscription.
          //Todo:
          // * inform user by e-mail
          break;
        default:
          logger.warn(`Unhandled event: ${event.type}`);
          return NextResponse.json(
            { message: 'Unhandled event' },
            { status: 200 }
          );
      }
    } catch (error) {
      logger.error({ err: error });
      return NextResponse.json(
        { message: 'Webhook handler failed' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: 'Received' }, { status: 200 });
}
