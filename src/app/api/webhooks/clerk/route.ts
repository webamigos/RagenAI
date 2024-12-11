import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { logger } from '@/app/lib/utils/logger';
import { createOrganizationWithDefaultProject } from '@/app/lib/services/apiKeys';
import { setSentryServiceTag } from '@/app/lib/services/sentry';
import { clerkClient } from '@clerk/nextjs/server';

const serviceName = 'clerkWebhook';

export async function POST(req: Request) {
  setSentryServiceTag(serviceName);
  const SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

  if (!SIGNING_SECRET) {
    throw new Error(
      'Error: Please add CLERK_WEBHOOK_SIGNING_SECRET from Clerk Dashboard to .env or .env.local'
    );
  }

  // Create new Svix instance with secret
  const wh = new Webhook(SIGNING_SECRET);

  // Get headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error: Missing Svix headers', {
      status: 400,
    });
  }

  // Get body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  let evt: WebhookEvent;

  // Verify payload with headers
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    logger.error({ err }, 'Error: Could not verify webhook:');
    return new Response('Error: Verification error', {
      status: 400,
    });
  }

  try {
    const { id } = evt.data;
    const eventType = evt.type;
    logger.info(
      `Received webhook with ID ${id} and event type of ${eventType}`
    );
    logger.info(body, 'Webhook payload:', body);

    switch (evt.type) {
      case 'user.created':
        const firstName = evt.data.first_name || 'User';
        const organizationName = `${firstName}'s Organization`;

        const clerkOrg = await clerkClient.organizations.createOrganization({
          name: organizationName,
          createdBy: evt.data.id,
        });

        logger.info(
          {
            userId: evt.data.id,
            organizationId: clerkOrg.id,
          },
          'User and organization created'
        );

        break;
      case 'organization.created':
        await createOrganizationWithDefaultProject(evt.data.id);

        break;

      default:
        logger.info({ eventType }, 'Unhandled event type');
      // return new Response('Unhandled event type', { status: 400 });
    }
  } catch (err) {
    logger.error({ err }, 'Error: Could not handle webhook:');
    return new Response('Error: Could not handle webhook', {
      status: 400,
    });
  }

  return new Response('Webhook received', { status: 200 });
}
