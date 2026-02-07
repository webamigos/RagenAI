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

        // Set default vector store (qdrant for local dev, can be changed in settings)
        // This prevents defaulting to Supabase which may not be available
        const defaultVectorStore = process.env.DEFAULT_VECTOR_STORE || 'qdrant';
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
          'Set default vector store for new organization'
        );

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
    // Use Better Auth API to properly update both database and session cookie
    try {
      // @ts-ignore - setActiveOrganization exists but is not properly typed in Better Auth API
      await auth.api.setActiveOrganization({
        body: {
          organizationId: firstOrg.id,
        },
        headers: await headers(),
      });

      logger.info(
        { userId, orgId: firstOrg.id },
        'Set activeOrganizationId via Better Auth API'
      );
    } catch (setActiveError) {
      logger.error(
        { err: setActiveError, userId, orgId: firstOrg.id },
        'Failed to set active organization via API, trying direct update'
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
          data: { activeOrganizationId: firstOrg.id },
        });

        logger.info(
          { userId, orgId: firstOrg.id, sessionId: userSessions[0].id },
          'Set activeOrganizationId via direct Prisma update fallback'
        );
      } else {
        logger.error({ userId }, 'No session found for user');
        throw new Error('No session found for user');
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
