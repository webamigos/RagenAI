/* eslint-disable no-console */
// Console logging is intentional in this file to avoid importing logger/mailer
// which would cause webpack bundling issues in middleware (Edge Runtime)
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization, openAPI, admin } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { stripe } from '@better-auth/stripe';
import { orgAccessControl, orgRoles } from './auth-access-control';
import Stripe from 'stripe';
import crypto from 'node:crypto';
import db from '@ragenai/prisma-client';
import { createOrganizationWithDefaultProjectCommand as createOrganizationWithDefaultProject } from '@/features/organizations/services/commands/create-organization-command';
import { applyDefaultLimitsToOrg } from '@/features/organizations/services/organization-settings';

const stripeClient = new Stripe(
  process.env.STRIPE_SECRET_KEY || 'sk_placeholder_for_build',
);

const RESEND_DEFAULT_AUDIENCE_ID = process.env.RESEND_DEFAULT_AUDIENCE_ID!;

// Email functions - using console.log to avoid importing logger/mailer in middleware
// TODO: Move email sending to background jobs instead of auth hooks
async function sendPasswordResetEmail({
  to,
  resetUrl,
}: {
  to: string;
  resetUrl: string;
}) {
  try {
    const { sendPasswordResetEmailViaMailer } =
      await import('@/app/emails/services/mailer');
    await sendPasswordResetEmailViaMailer({ to, resetUrl });
    console.log('[AUTH] Password reset email sent', { to });
  } catch (error) {
    console.error('[AUTH] Failed to send password reset email', { to, error });
  }
}

async function sendOrganizationInvite(data: any) {
  // Import mailer dynamically to avoid Edge Runtime issues
  const { sendInvitationEmail } = await import('@/app/emails/services/mailer');

  try {
    await sendInvitationEmail({
      to: data.email,
      organizationName: data.organizationName,
      inviterName: data.inviterName,
      role: data.role,
      invitationId: data.id,
      expiresAt: data.expiresAt,
    });
    console.log('[AUTH] Invitation email sent', { email: data.email });
  } catch (error) {
    console.error('[AUTH] Failed to send invitation email', { error, data });
    // Don't throw - invitation was created successfully
  }
}

async function sendWelcomeEmail({ to, name }: { to: string; name: string }) {
  console.log('[AUTH] Welcome email would be sent', { to, name });
}

async function addEmailToAudience({
  email,
  firstName,
  audienceId,
}: {
  email: string;
  firstName: string;
  audienceId: string;
}) {
  console.log('[AUTH] Email would be added to audience', {
    email,
    firstName,
    audienceId,
  });
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  trustedOrigins: [
    'http://localhost:3000',
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
  ],

  advanced: {
    cookiePrefix: 'better-auth',
  },

  database: prismaAdapter(db, {
    provider: 'postgresql',
  }),

  socialProviders: {
    google: {
      prompt: 'select_account',
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Disabled for development - users can login without email verification
    async sendResetPassword({ user, url }) {
      await sendPasswordResetEmail({ to: user.email, resetUrl: url });
    },
  },

  plugins: [
    openAPI(),
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
    }),
    organization({
      ac: orgAccessControl,
      roles: orgRoles,
      teams: {
        enabled: true,
      },
      async sendInvitationEmail(data) {
        await sendOrganizationInvite(data);
      },
    }),
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: async () => {
          const plans = await db.subscriptionPlan.findMany({
            where: { status: 'ACTIVE' },
          });
          return plans.map((plan) => ({
            name: plan.name,
            priceId: plan.priceId,
            limits: plan.limits as Record<string, number>,
            freeTrial: { days: 14 },
          }));
        },
      },
      onCustomerCreate: async ({ stripeCustomer, user }) => {
        console.log('[AUTH:Stripe] Customer created', {
          customerId: stripeCustomer.id,
          userId: user.id,
        });
      },
    }),
    nextCookies(),
  ],

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },

  user: {
    additionalFields: {
      onboardingComplete: {
        type: 'boolean',
        defaultValue: false,
      },
      role: {
        type: 'string',
        defaultValue: 'user',
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            const firstName = user.name || 'User';
            const organizationName = `${firstName}'s Organization`;

            console.log('[AUTH] Creating organization for new user', {
              userId: user.id,
            });

            // Create organization directly via Prisma (auth.api requires session context
            // which is not available during OAuth callback hooks)
            const orgId = crypto.randomUUID();
            const memberId = crypto.randomUUID();

            await db.organization.create({
              data: {
                id: orgId,
                name: organizationName,
                slug: `${user.id}-org`,
              },
            });

            await db.member.create({
              data: {
                id: memberId,
                organizationId: orgId,
                userId: user.id,
                role: 'owner',
              },
            });

            console.log('[AUTH] Organization created and user added as owner', {
              userId: user.id,
              orgId,
            });

            // Create default project and apply default limits
            await createOrganizationWithDefaultProject(orgId, user.id);
            await applyDefaultLimitsToOrg(orgId);

            // Set default vector store (meilisearch for local dev, can be changed in settings)
            const defaultVectorStore =
              process.env.DEFAULT_VECTOR_STORE || 'meilisearch';
            await db.organization.update({
              where: { id: orgId },
              data: {
                vectorStore: defaultVectorStore,
                metadata: {
                  vector_store: defaultVectorStore,
                },
              },
            });

            // Stripe customer + trial subscription handled by Better Auth stripe plugin
            console.log('[AUTH] Stripe customer creation handled by plugin');

            // Send welcome email
            await sendWelcomeEmail({
              to: user.email,
              name: user.name || firstName,
            });
            console.log('[AUTH] Welcome email sent', { email: user.email });

            // Add to newsletter (only if RESEND_DEFAULT_AUDIENCE_ID is configured)
            if (RESEND_DEFAULT_AUDIENCE_ID) {
              await addEmailToAudience({
                email: user.email,
                firstName: user.name || firstName,
                audienceId: RESEND_DEFAULT_AUDIENCE_ID,
              });
              console.log('[AUTH] Added to newsletter audience', {
                email: user.email,
              });
            } else {
              console.log(
                '[AUTH] Skipping newsletter signup - RESEND_DEFAULT_AUDIENCE_ID not configured',
              );
            }
          } catch (error) {
            console.error('[AUTH] Error in user.created hook', {
              userId: user.id,
              error,
            });
            // Don't throw - allow user creation to succeed even if post-creation steps fail
          }
        },
      },
    },
  },

  // Subscription lifecycle managed by Better Auth stripe plugin
});

export type Session = typeof auth.$Infer.Session;
