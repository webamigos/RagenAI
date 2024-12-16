import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { logger } from '@/app/lib/utils/logger';
import { createOrganizationWithDefaultProject } from '@/app/lib/services/apiKeys';
import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { clerkClient } from '@clerk/nextjs/server';
import db from '@ragenai/prisma-client';
import { saveOrganizationInitialMetadata } from '@/app/actions';

const serviceName = 'clerkWebhook';

const trialDays = 14;

async function createTrialSubscription(providerId: string) {
  const trialPlan = await db.plan.findFirst({
    where: {
      name: 'Trial',
      type: 'INTERNAL',
      status: 'ACTIVE',
    },
  });

  if (!trialPlan) {
    throw new Error('Trial plan not found');
  }

  const now = new Date();
  const trialEnd = new Date(now.setDate(now.getDate() + trialDays));

  const organization = await db.organization.findFirst({
    where: {
      provider_id: providerId,
    },
  });

  if (!organization) {
    throw new Error('Organization not found');
  }

  return db.subscription.create({
    data: {
      organization_id: organization.id,
      plan_id: trialPlan.id,
      status: 'ACTIVE',
      current_period_start: new Date(),
      current_period_end: trialEnd,
      trial_end: trialEnd,
    },
    include: {
      plan: true,
    },
  });
}

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
    logger.info(`Received webhook with ID ${id} and type ${eventType}`);

    switch (evt.type) {
      case 'user.created':
        const firstName = evt.data.first_name || 'User';
        const organizationName = `${firstName}'s Organization`;
        const userId = evt.data.id;

        setSentryServiceTag('webhook:user.created');

        try {
          const { id } = await clerkClient.organizations.createOrganization({
            name: organizationName,
            createdBy: userId,
          });

          logger.info(
            `For user: ${userId}, created organization with id: ${id}`
          );
        } catch (error) {
          logger.error(
            { error },
            `Error: cannot create organization for user ${userId}:`
          );
        }

        break;

      case 'organization.created':
        const clerkOrgId = evt.data.id;

        setSentryServiceTag('webhook:organization.created');
        setSentryClerkOrganizationTag(clerkOrgId);

        try {
          const ragenOrg = await createOrganizationWithDefaultProject(
            clerkOrgId
          );

          const subscription = await createTrialSubscription(clerkOrgId);

          await saveOrganizationInitialMetadata(clerkOrgId, {
            publicMetadata: {
              hasKnowledge: false,
              subscription: {
                plan: {
                  name: subscription.plan.name,
                  type: subscription.plan.type,
                },
                status: subscription.status,
                current_period_start: subscription.current_period_start,
                current_period_end: subscription.current_period_end,
                trial_end: subscription.trial_end,
              },
            },
            privateMetadata: {
              ragen_org_id: ragenOrg.id,
              vector_store: 'supabase',
            },
          });
          logger.info(
            `Organization ${clerkOrgId} created and configured with id: ${ragenOrg.id} and public id: ${ragenOrg.publicId}`
          );
        } catch (error) {
          logger.error(
            { error },
            `Error: cannot sync organization with app ${clerkOrgId}:`
          );
        }

        break;

      default:
        logger.info({ eventType }, 'Unhandled event type, skipping...');
    }
  } catch (err) {
    logger.error({ err }, 'Error: Could not handle webhook:');
    return new Response('Error: Could not handle webhook', {
      status: 400,
    });
  }

  return new Response('Webhook received', { status: 200 });
}
