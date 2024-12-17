import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { clerkClient } from '@clerk/nextjs/server';
import { type CreateContactOptions, Resend } from 'resend';

import { logger } from '@/app/lib/utils/logger';
import { createOrganizationWithDefaultProject } from '@/app/lib/services/apiKeys';
import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import {
  addEmailToAudience,
  sendWelcomeEmail,
} from '@/app/emails/services/mailer';

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const RESEND_DEFAULT_AUDIENCE_ID = process.env.RESEND_DEFAULT_AUDIENCE_ID!;
import { saveOrganizationInitialMetadata } from '@/app/actions';
import {
  activateFreePlan,
  createTrialSubscription,
  getOrganizationSubscription,
} from '@/app/lib/services/plan';

const serviceName = 'clerkWebhook';
const resend = new Resend(RESEND_API_KEY);

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
        let userFirstName: string | undefined;
        if (typeof evt.data.first_name === 'string') {
          userFirstName = evt.data.first_name;
        }
        const userEmail: string = evt.data.email_addresses[0].email_address;

        const firstName = userFirstName || 'User';
        const organizationName = `${firstName}'s Organization`;
        const userId = evt.data.id;

        setSentryServiceTag('webhook:user.created');

        try {
          const { id } = await clerkClient.organizations.createOrganization({
            name: organizationName,
            createdBy: userId,
          });

          // send welcome e-mail
          await sendWelcomeEmail({ to: userEmail, name: userFirstName });

          // create new contact in base
          let resendContactDetails: CreateContactOptions = {
            email: userEmail,
            firstName: userFirstName,
            unsubscribed: false,
            audienceId: RESEND_DEFAULT_AUDIENCE_ID,
          };

          await addEmailToAudience(resendContactDetails);

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
            },
            privateMetadata: {
              ragen_org_id: ragenOrg.id,
              vector_store: 'supabase',
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

      case 'session.created':
        const lastOrganizationId = evt.data?.last_active_organization_id;
        if (!lastOrganizationId) {
          logger.info('No last organization id found, skipping...');
          break;
        }

        setSentryServiceTag('webhook:session.created');
        try {
          const organization = await getOrganizationSubscription(
            lastOrganizationId
          );

          if (organization?.subscription?.plan.name === 'Trial') {
            const isExpired =
              organization?.subscription?.current_period_end &&
              organization?.subscription?.current_period_end < new Date();
            if (isExpired) {
              logger.info(
                `Organization ${organization.provider_id} has trial plan and is expired, activating...`
              );
              const freePlan = await activateFreePlan(organization.provider_id);

              // Update Clerk organization metadata with new subscription info
              await clerkClient.organizations.updateOrganization(
                lastOrganizationId,
                {
                  privateMetadata: {
                    subscription: {
                      plan: {
                        name: freePlan.plan.name,
                        type: freePlan.plan.type,
                      },
                      status: freePlan.status,
                      current_period_start: freePlan.current_period_start,
                      current_period_end: freePlan.current_period_end,
                      trial_end: null,
                    },
                  },
                }
              );
            }
          }
        } catch (error) {
          logger.error(
            { error },
            `Error: cannot get organization with id ${lastOrganizationId}`
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
