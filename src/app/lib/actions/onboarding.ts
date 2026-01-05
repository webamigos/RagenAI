'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { createTrialSubscription } from '@/app/lib/services/plan';
import { logger } from '@/app/lib/utils/logger';
import db from '@ragenai/prisma-client';

/**
 * Finalize user onboarding after organization creation
 * Called after user.created hook completes
 *
 * This function:
 * 1. Sets activeOrganizationId in session
 * 2. Creates trial subscription
 */
export async function finalizeUserOnboarding() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      throw new Error('Not authenticated');
    }

    const userId = session.user.id;
    const userName = session.user.name || 'User';

    // Get user's first organization
    // listOrganizations returns orgs for authenticated user (from session cookie)
    let memberships = (await (auth.api as any).listOrganizations({
      headers: await headers(),
    })) as any[];

    let firstOrg = memberships?.[0];

    // If no organization exists, create one
    // (user.created hook may not have finished yet, or may have failed)
    if (!firstOrg) {
      logger.info(
        { userId },
        'No organization found, creating one in finalizeUserOnboarding'
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
          'Organization API response'
        );

        // Extract org ID from response (may be org.id or org.data.id)
        const orgId = org?.id || org?.data?.id;
        if (!orgId) {
          throw new Error('createOrganization returned invalid response');
        }

        logger.info(
          { userId, orgId },
          'Organization created with owner membership'
        );

        // Note: createOrganization automatically adds creator as owner member
        // No need to call addMember separately

        // Create internal org + default project (from auth hook logic)
        const { createOrganizationWithDefaultProject } = await import(
          '@/app/lib/services/apiKeys'
        );
        await createOrganizationWithDefaultProject(orgId, userId);

        // Set firstOrg to the created organization
        firstOrg = { id: orgId, name: `${userName}'s Organization` };
      } catch (createError) {
        logger.error(
          { err: createError, userId },
          'Failed to create organization in finalizeUserOnboarding'
        );
        throw new Error('Failed to create organization for user');
      }
    }

    if (!firstOrg) {
      throw new Error('No organization found or created for user');
    }

    // Set active organization in session
    // NOTE: Better Auth organization plugin provides setActiveOrganization
    // Using 'as any' to bypass TypeScript errors until types are fixed
    try {
      await (auth.api as any).setActiveOrganization({
        headers: await headers(),
        body: { organizationId: firstOrg.id },
      });

      logger.info(
        { userId, orgId: firstOrg.id },
        'Set activeOrganizationId via Better Auth API'
      );
    } catch (err) {
      // Fallback: Update Session table directly
      logger.warn(
        { userId, orgId: firstOrg.id, err },
        'setActiveOrganization not available, using direct Prisma update'
      );

      // Find user's session and update activeOrganizationId
      const userSessions = await db.session.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      if (userSessions[0]) {
        await db.session.update({
          where: { id: userSessions[0].id },
          data: { activeOrganizationId: firstOrg.id },
        });

        logger.info(
          { userId, orgId: firstOrg.id, sessionId: userSessions[0].id },
          'Set activeOrganizationId via direct Prisma update'
        );
      }
    }

    // Create trial subscription
    await createTrialSubscription(firstOrg.id);

    logger.info(
      { userId, orgId: firstOrg.id },
      'User onboarding finalized successfully'
    );

    return { success: true, organizationId: firstOrg.id };
  } catch (error) {
    logger.error({ err: error }, 'Error finalizing user onboarding');
    throw error;
  }
}
