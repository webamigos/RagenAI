import type { Stripe } from 'stripe';

import { NextResponse } from 'next/server';
import { logger } from '@/app/lib/utils/logger';

import { stripe } from '@/libs/payments/stripe';
import {
  createPaidSubscription,
  updatePaidSubscription,
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
    // On error, log and return the error message.
    if (err! instanceof Error) logger.error(err);
    logger.error(`❌ Error message: ${errorMessage}`);
    return NextResponse.json(
      { message: `Webhook Error: ${errorMessage}` },
      { status: 400 }
    );
  }

  // Successfully constructed event.
  //   logger.info(`✅ Success: ${event.id}`);
  //   logger.warn(`Event type: ${event.type}`);

  const permittedEvents: string[] = [
    'checkout.session.completed',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'charge.succeeded',
    'charge.failed',
  ];

  if (permittedEvents.includes(event.type)) {
    let data;

    try {
      switch (event.type) {
        case 'customer.subscription.created':
          data = event.data.object as Stripe.Subscription;
          logger.info(`💰 Creating subscription: ${data.id}`);

          const session = await stripe.checkout.sessions.list({
            subscription: data.id,
            limit: 1,
          });

          const organizationId = session.data[0].client_reference_id;

          if (!organizationId) {
            throw new Error('Organization not found');
          }

          await createPaidSubscription(data, organizationId);
          break;
        case 'customer.subscription.updated':
          data = event.data.object as Stripe.Subscription;
          logger.info(`💰 Updating subscription: ${data.id}`);
          await updatePaidSubscription(data);
          break;
        case 'checkout.session.completed':
          data = event.data.object as Stripe.Checkout.Session;
          logger.info(`💰 CheckoutSession status: ${data.payment_status}`);
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
        case 'payment_intent.payment_failed':
          data = event.data.object as Stripe.PaymentIntent;
          logger.error(
            `❌ Payment failed: ${data.last_payment_error?.message}`
          );
          break;
        case 'payment_intent.succeeded':
          data = event.data.object as Stripe.PaymentIntent;
          logger.info(`💰 PaymentIntent status: ${data.status}`);
          break;
        default:
          logger.info(`Unhandled event: ${event.type}`);
        //   throw new Error(`Unhandled event: ${event.type}`);
      }
    } catch (error) {
      logger.error(error);
      return NextResponse.json(
        { message: 'Webhook handler failed' },
        { status: 500 }
      );
    }
  }
  // Return a response to acknowledge receipt of the event.
  return NextResponse.json({ message: 'Received' }, { status: 200 });
}
