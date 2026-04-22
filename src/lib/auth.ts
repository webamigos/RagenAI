/* eslint-disable no-console */
// Console logging is intentional in this file to avoid importing logger/mailer
// which would cause webpack bundling issues in middleware (Edge Runtime)
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { organization, openAPI, admin } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { stripe as stripePlugin } from '@better-auth/stripe';
import { orgAccessControl, orgRoles } from './auth-access-control';
import Stripe from 'stripe';
import crypto from 'node:crypto';
import db from '@ragenai/prisma-client';
import { createOrganizationWithDefaultProjectCommand as createOrganizationWithDefaultProject } from '@/features/organizations/services/commands/create-organization-command';
import { applyDefaultLimitsToOrg } from '@/features/organizations/services/organization-settings';
import { ensureLiteLLMTeamCommand } from '@/features/organizations/services/commands/litellm-team-command';
import { provisionLiteLLMForTeamCommand } from '@/features/teams/services/commands/provision-litellm-team-command';
import { updateLiteLLMForTeamCommand } from '@/features/teams/services/commands/update-litellm-team-command';
import { deprovisionLiteLLMForTeamCommand } from '@/features/teams/services/commands/deprovision-litellm-team-command';
import {
  syncLiteLLMTeamMemberAddCommand,
  syncLiteLLMTeamMemberRemoveCommand,
} from '@/features/teams/services/commands/sync-litellm-team-member-command';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { eventBus } from '@/libs/events';

const stripeClient =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null;

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
    const result = await sendPasswordResetEmailViaMailer({ to, resetUrl });
    if ('error' in result) {
      console.error('[AUTH] Failed to send password reset email', {
        to,
        error: result.error,
      });
    } else {
      console.log('[AUTH] Password reset email sent', { to });
    }
  } catch (error) {
    console.error('[AUTH] Failed to send password reset email', { to, error });
  }
}

async function sendVerificationEmailViaMailer({
  to,
  verificationUrl,
}: {
  to: string;
  verificationUrl: string;
}) {
  try {
    const { sendVerificationEmail } =
      await import('@/app/emails/services/mailer');
    const result = await sendVerificationEmail({
      to,
      verificationUrl,
    });
    if ('error' in result) {
      console.error('[AUTH] Failed to send verification email', {
        to,
        error: result.error,
      });
    } else {
      console.log('[AUTH] Verification email sent', { to });
    }
  } catch (error) {
    console.error('[AUTH] Failed to send verification email', { to, error });
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
    requireEmailVerification:
      process.env.NODE_ENV === 'production' ||
      process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
    minPasswordLength: 8,
    maxPasswordLength: 128,
    async sendResetPassword({ user, url }) {
      await sendPasswordResetEmail({ to: user.email, resetUrl: url });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    async sendVerificationEmail({ user, url }) {
      await sendVerificationEmailViaMailer({
        to: user.email,
        verificationUrl: url,
      });
    },
    async afterEmailVerification(user) {
      await eventBus.emit('user.emailVerified', {
        userId: user.id,
        email: user.email,
        name: user.name ?? null,
      });
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
      organizationHooks: {
        afterCreateTeam: async ({ team }) => {
          try {
            await provisionLiteLLMForTeamCommand({ teamId: team.id });
          } catch (error) {
            console.error('[AUTH] Failed to provision LiteLLM team', {
              teamId: team.id,
              error,
            });
          }
          trackAudit({
            action: 'team.created',
            entityType: 'Team',
            entityId: team.id,
            newData: { name: team.name, organizationId: team.organizationId },
          });
        },
        afterUpdateTeam: async ({ team }) => {
          if (!team) {
            return;
          }
          try {
            await updateLiteLLMForTeamCommand({ teamId: team.id });
          } catch (error) {
            console.error('[AUTH] Failed to sync LiteLLM team update', {
              teamId: team.id,
              error,
            });
          }
        },
        beforeDeleteTeam: async ({ team }) => {
          try {
            await deprovisionLiteLLMForTeamCommand({
              teamId: team.id,
              litellmTeamId: team.litellmTeamId ?? null,
              litellmKeyToken: team.litellmKeyToken ?? null,
            });
          } catch (error) {
            console.error('[AUTH] Failed to deprovision LiteLLM team', {
              teamId: team.id,
              error,
            });
          }
          trackAudit({
            action: 'team.deleted',
            entityType: 'Team',
            entityId: team.id,
            oldData: { name: team.name, organizationId: team.organizationId },
          });
        },
        afterAddTeamMember: async ({ teamMember, user }) => {
          try {
            await syncLiteLLMTeamMemberAddCommand({
              teamId: teamMember.teamId,
              userId: teamMember.userId,
              userEmail: user?.email,
            });
          } catch (error) {
            console.error('[AUTH] Failed to sync LiteLLM team member add', {
              teamId: teamMember.teamId,
              userId: teamMember.userId,
              error,
            });
          }
          trackAudit({
            action: 'team.member_added',
            entityType: 'Team',
            entityId: teamMember.teamId,
            newData: { userId: teamMember.userId, email: user?.email ?? null },
          });
        },
        afterRemoveTeamMember: async ({ teamMember, user }) => {
          try {
            await syncLiteLLMTeamMemberRemoveCommand({
              teamId: teamMember.teamId,
              userId: teamMember.userId,
              userEmail: user?.email,
            });
          } catch (error) {
            console.error('[AUTH] Failed to sync LiteLLM team member remove', {
              teamId: teamMember.teamId,
              userId: teamMember.userId,
              error,
            });
          }
          trackAudit({
            action: 'team.member_removed',
            entityType: 'Team',
            entityId: teamMember.teamId,
            oldData: { userId: teamMember.userId, email: user?.email ?? null },
          });
        },
      },
    }),
    ...(stripeClient
      ? [
          stripePlugin({
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
        ]
      : []),
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

            // Create LiteLLM team + virtual key for this organization
            try {
              await ensureLiteLLMTeamCommand(orgId, organizationName);
            } catch (litellmError) {
              console.error(
                '[AUTH] Failed to create LiteLLM team (will retry later)',
                { orgId, error: litellmError },
              );
            }

            // Set default vector store (qdrant for local dev, can be changed in settings)
            const defaultVectorStore =
              process.env.DEFAULT_VECTOR_STORE || 'qdrant';
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

            // Welcome email and newsletter signup are sent from
            // emailVerification.afterEmailVerification — not here —
            // so they only go out after the user actually verifies their email.
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
