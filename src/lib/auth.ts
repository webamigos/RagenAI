/* eslint-disable no-console */
// Console logging is intentional in this file to avoid importing logger/mailer
// which would cause webpack bundling issues in middleware (Edge Runtime)
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization, openAPI } from 'better-auth/plugins';
import { createAuthMiddleware } from 'better-auth/api';
import db from '@ragenai/prisma-client';
import { createOrganizationWithDefaultProject } from '@/app/lib/services/apiKeys';
// TEMPORARILY COMMENTED: Causes logger import which breaks Edge Runtime middleware
// These will be removed entirely in FAZA 2 when hooks are replaced with Server Actions
// import {
//   activateFreePlan,
//   checkIfOrganizationPlanIsExpired,
//   createTrialSubscription,
// } from '@/app/lib/services/plan';

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
  console.log('[AUTH] Password reset email would be sent', { to, resetUrl });
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

  database: prismaAdapter(db, {
    provider: 'postgresql',
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Disabled for development - users can login without email verification
    async sendResetPassword({ user, url }) {
      await sendPasswordResetEmail({ to: user.email, resetUrl: url });
    },
  },

  plugins: [
    openAPI(),
    // TODO: Add custom roles configuration using createAccessControl API
    // For now using default roles: owner, admin, member
    organization({
      async sendInvitationEmail(data) {
        await sendOrganizationInvite(data);
      },
    }),
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

            // Create organization via Better Auth
            const org = await auth.api.createOrganization({
              body: {
                name: organizationName,
                slug: `${user.id}-org`,
              },
              headers: new Headers(),
            });

            if (!org?.id) {
              throw new Error('Failed to create organization');
            }

            console.log('[AUTH] Organization created', {
              userId: user.id,
              orgId: org.id,
            });

            // Add user as owner
            await auth.api.addMember({
              body: {
                organizationId: org.id,
                userId: user.id,
                role: 'owner',
              },
              headers: new Headers(),
            });

            console.log('[AUTH] User added as owner', {
              userId: user.id,
              orgId: org.id,
            });

            // Create internal org + default project
            const ragenOrg = await createOrganizationWithDefaultProject(
              org.id,
              user.id
            );
            console.log('[AUTH] Internal organization created', {
              ragenOrgId: ragenOrg.id,
            });

            // Set default vector store (qdrant for local dev, can be changed in settings)
            const defaultVectorStore =
              process.env.DEFAULT_VECTOR_STORE || 'qdrant';
            await db.organization.update({
              where: { id: org.id },
              data: {
                vectorStore: defaultVectorStore,
                metadata: {
                  vector_store: defaultVectorStore,
                },
              },
            });

            // TEMPORARILY COMMENTED: Will be moved to Server Action in FAZA 2
            // Create trial subscription
            // await createTrialSubscription(org.data!.id);
            console.log(
              '[AUTH] Trial subscription skipped (will be created in Server Action)'
            );

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
                '[AUTH] Skipping newsletter signup - RESEND_DEFAULT_AUDIENCE_ID not configured'
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

  // TODO FAZA 2: Re-enable session hooks for plan expiration check
  // Currently disabled as plan checking will be moved to Server Actions
  // hooks: {
  //   after: createAuthMiddleware(async (ctx) => {
  //     const newSession = ctx.context.newSession;
  //     if (!newSession) return;
  //     // Check plan expiration and activate free plan if needed
  //   }),
  // },
});

export type Session = typeof auth.$Infer.Session;
