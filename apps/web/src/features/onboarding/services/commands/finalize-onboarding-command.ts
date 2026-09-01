'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { TRIAL_PLAN_NAME, TRIAL_DAYS } from '@/app/config';
import { logger } from '@/app/lib/utils/logger';
import db from '@ragenai/prisma-client';
import { resolveDefaultVectorStore } from '@ragenai/rag-core';

/**
 * Finalize user onboarding after organization creation
 * Called after user.created hook completes
 *
 * This function:
 * 1. Sets activeOrganizationId in session
 * 2. Creates trial subscription
 */
export async function finalizeOnboardingCommand(preferredOrgId?: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      throw new Error('Not authenticated');
    }

    const userId = session.user.id;
    const userName = session.user.name || 'User';

    // Get user's organizations
    // listOrganizations returns orgs for authenticated user (from session cookie)
    const memberships = (await (auth.api as any).listOrganizations({
      headers: await headers(),
    })) as any[];

    // Find personal org by slug pattern (created by user.created hook with slug `${userId}-org`)
    let firstOrg =
      memberships?.find((m: any) => m.slug === `${userId}-org`) ||
      memberships?.[0];

    // If no organization exists, create one
    // (user.created hook may not have finished yet, or may have failed)
    if (!firstOrg) {
      logger.info(
        { userId },
        'No organization found, creating one in finalizeUserOnboarding',
      );

      try {
        // Create organization via Better Auth
        const org = await (auth.api as any).createOrganization({
          body: {
            name: `${userName}'s Organization`,
            slug: `${userId}-org`,
          },
          headers: await headers(),
        });

        logger.info(
          { userId, orgResponse: JSON.stringify(org) },
          'Organization API response',
        );

        // Extract org ID from response (may be org.id or org.data.id)
        const orgId = org?.id || org?.data?.id;
        if (!orgId) {
          throw new Error('createOrganization returned invalid response');
        }

        logger.info(
          { userId, orgId },
          'Organization created with owner membership',
        );

        // Note: createOrganization automatically adds creator as owner member
        // No need to call addMember separately

        // Create default project for organization
        const { createOrganizationWithDefaultProjectCommand } =
          await import('@/features/organizations/services/commands/create-organization-command');
        await createOrganizationWithDefaultProjectCommand(orgId, userId);

        // Only backends the ingest worker actually writes to are accepted.
        const defaultVectorStore = resolveDefaultVectorStore();
        await db.organization.update({
          where: { id: orgId },
          data: {
            vectorStore: defaultVectorStore,
            metadata: {
              vector_store: defaultVectorStore,
            },
          },
        });

        logger.info(
          { userId, orgId, vectorStore: defaultVectorStore },
          'Set default vector store for new organization',
        );

        // Create LiteLLM team + virtual key
        try {
          const { ensureLiteLLMTeamCommand } =
            await import('@/features/organizations/services/commands/litellm-team-command');
          await ensureLiteLLMTeamCommand(orgId, `${userName}'s Organization`);
        } catch (litellmError) {
          logger.error(
            { err: litellmError, orgId },
            'Failed to create LiteLLM team during onboarding (will retry later)',
          );
        }

        // Apply default limits (including $10 monthly budget) and RAG settings to new org
        try {
          const { applyDefaultLimitsToOrg, applyDefaultRagSettingsToOrg } =
            await import('@/features/organizations/services/organization-settings');
          const { syncLiteLLMTeamBudgetCommand } =
            await import('@/features/organizations/services/commands/litellm-team-command');
          await applyDefaultLimitsToOrg(orgId);
          await applyDefaultRagSettingsToOrg(orgId);
          await syncLiteLLMTeamBudgetCommand(orgId);
        } catch (limitsError) {
          logger.error(
            { err: limitsError, orgId },
            'Failed to apply default limits/RAG settings during onboarding',
          );
        }

        // Set firstOrg to the created organization
        firstOrg = {
          id: orgId,
          name: `${userName}'s Organization`,
          slug: `${userId}-org`,
        };
      } catch (createError) {
        logger.error(
          { err: createError, userId },
          'Failed to create organization in finalizeUserOnboarding',
        );
        throw new Error('Failed to create organization for user');
      }
    }

    if (!firstOrg) {
      throw new Error('No organization found or created for user');
    }

    // If user was invited to an org, set that as active; otherwise use personal org
    const isMemberOfPreferred =
      preferredOrgId && memberships?.some((m: any) => m.id === preferredOrgId);
    const activeOrgId = isMemberOfPreferred ? preferredOrgId : firstOrg.id;

    // Set active organization in session
    // Use Better Auth API to properly update both database and session cookie
    try {
      // @ts-ignore - setActiveOrganization exists but is not properly typed in Better Auth API
      await auth.api.setActiveOrganization({
        body: {
          organizationId: activeOrgId,
        },
        headers: await headers(),
      });

      logger.info(
        { userId, orgId: activeOrgId, preferredOrgId },
        'Set activeOrganizationId via Better Auth API',
      );
    } catch (setActiveError) {
      logger.error(
        { err: setActiveError, userId, orgId: activeOrgId },
        'Failed to set active organization via API, trying direct update',
      );

      // Fallback to direct Prisma update if Better Auth API fails
      const userSessions = await db.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      if (userSessions[0]) {
        await db.session.update({
          where: { id: userSessions[0].id },
          data: { activeOrganizationId: activeOrgId },
        });

        logger.info(
          { userId, orgId: activeOrgId, sessionId: userSessions[0].id },
          'Set activeOrganizationId via direct Prisma update fallback',
        );
      } else {
        logger.error({ userId }, 'No session found for user');
        throw new Error('No session found for user');
      }
    }

    // Self-heal: the user.created hook in lib/auth.ts is supposed to add
    // the user to the default "General" team, but it swallows errors and
    // can race with the rest of onboarding. Ensure the team exists and
    // that the user is a member before we hand them the dashboard.
    try {
      const defaultTeamId = `${activeOrgId}-general`;
      await db.team.upsert({
        where: { id: defaultTeamId },
        update: {},
        create: {
          id: defaultTeamId,
          name: 'General',
          organizationId: activeOrgId,
        },
      });
      const existingTeamMembership = await db.teamMember.findFirst({
        where: { teamId: defaultTeamId, userId },
        select: { id: true },
      });
      if (!existingTeamMembership) {
        await db.teamMember.create({
          data: {
            id: crypto.randomUUID(),
            teamId: defaultTeamId,
            userId,
          },
        });
        logger.info(
          { userId, teamId: defaultTeamId, activeOrgId },
          'Self-healed default team membership during onboarding',
        );
      }
    } catch (teamHealError) {
      logger.warn(
        { err: teamHealError, userId, activeOrgId },
        'Failed to self-heal default team membership during onboarding',
      );
    }

    // Only create a trial subscription for the user's own personal org, and
    // only if that org has no subscription yet. Invited orgs already have
    // their own subscription managed by the inviting account.
    const isPersonalOrg = firstOrg.slug === `${userId}-org`;
    if (isPersonalOrg) {
      const existing = await db.subscription.findFirst({
        where: { referenceId: firstOrg.id },
        select: { id: true },
      });
      if (!existing) {
        const now = new Date();
        const trialEnd = new Date(
          now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
        );
        await db.subscription.create({
          data: {
            id: crypto.randomUUID(),
            plan: TRIAL_PLAN_NAME,
            referenceId: firstOrg.id,
            status: 'trialing',
            periodStart: now,
            periodEnd: trialEnd,
            trialStart: now,
            trialEnd: trialEnd,
          },
        });
      } else {
        logger.info(
          { userId, orgId: firstOrg.id, subscriptionId: existing.id },
          'Personal org already has a subscription, skipping trial creation',
        );
      }
    } else {
      logger.info(
        { userId, orgId: firstOrg.id, slug: firstOrg.slug },
        'firstOrg is not the personal org, skipping trial creation (invited org)',
      );
    }

    logger.info(
      { userId, activeOrgId, personalOrgId: firstOrg.id },
      'User onboarding finalized successfully',
    );

    return { success: true, organizationId: activeOrgId };
  } catch (error) {
    logger.error({ err: error }, 'Error finalizing user onboarding');
    throw error;
  }
}
