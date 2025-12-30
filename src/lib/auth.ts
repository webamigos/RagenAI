/* eslint-disable no-console */
// Console logging is intentional in this file to avoid importing logger/mailer
// which would cause webpack bundling issues in middleware (Edge Runtime)
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization, openAPI } from 'better-auth/plugins';
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
  console.log('[AUTH] Organization invite email would be sent', data);
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
    organization({
      async sendInvitationEmail(data) {
        await sendOrganizationInvite(data);
      },
      roles: {
        owner: {
          permissions: ['*'],
        },
        admin: {
          permissions: [
            'organization:read',
            'organization:update',
            'member:create',
            'member:read',
            'member:update',
            'member:delete',
            'project:*',
            'knowledge:*',
          ],
        },
        member: {
          permissions: ['organization:read', 'project:read', 'thread:*'],
        },
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

  hooks: {
    user: {
      created: {
        after: async ({ user }) => {
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

            console.log('[AUTH] Organization created', {
              userId: user.id,
              orgId: org.data?.id,
            });

            // Add user as owner
            await auth.api.addMember({
              body: {
                organizationId: org.data!.id,
                userId: user.id,
                role: 'owner',
              },
              headers: new Headers(),
            });

            console.log('[AUTH] User added as owner', {
              userId: user.id,
              orgId: org.data?.id,
            });

            // Create internal org + default project
            const ragenOrg = await createOrganizationWithDefaultProject(
              org.data!.id,
              user.id
            );
            console.log('[AUTH] Internal organization created', {
              ragenOrgId: ragenOrg.id,
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
    session: {
      created: {
        after: async ({ session }) => {
          try {
            const orgId = session.activeOrganizationId;
            if (!orgId) {
              console.log(
                '[AUTH] No active organization for session, skipping plan check'
              );
              return;
            }

            // TEMPORARILY COMMENTED: Will be moved to Server Action in FAZA 2
            // const isExpired = await checkIfOrganizationPlanIsExpired(orgId);
            // if (isExpired) {
            //   console.log('[AUTH] Plan expired, activating free plan', { orgId });
            //   await activateFreePlan(orgId);
            // }
            console.log(
              '[AUTH] Plan check skipped (will be handled in Server Action)'
            );
          } catch (error) {
            console.error('[AUTH] Error in session.created hook', { error });
            // Don't throw - session creation should succeed
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
