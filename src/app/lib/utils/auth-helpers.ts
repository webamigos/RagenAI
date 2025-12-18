import { auth, currentUser, clerkClient } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { logger } from './logger';

/**
 * Multi-strategy helper function to get organization ID from Clerk auth
 *
 * ROOT CAUSE FIX: Next.js 15 + Clerk v6 has a bug where auth() fails in Server Actions
 * due to middleware detection issues. This function implements multiple fallback strategies.
 *
 * Strategy 1: Try auth().orgId - Works in most contexts
 * Strategy 2: Extract from auth().sessionClaims.membership - Works when orgId is not set
 * Strategy 3: Check custom header x-clerk-org-id - Set by middleware (future enhancement)
 * Strategy 4: Fallback to currentUser() + membership lookup - Works when auth() fails
 * Strategy 5: Emergency fallback with clerkClient - Guaranteed to work
 */
export async function getOrgIdFromAuth(): Promise<string | null> {
  try {
    // Strategy 1: Standard auth() call
    const authResult = await auth();
    if (authResult.orgId) {
      logger.debug({ orgId: authResult.orgId }, 'Got orgId from auth()');
      return authResult.orgId;
    }

    // Strategy 2: Extract from sessionClaims if available
    if (authResult.sessionClaims?.membership) {
      const membershipKeys = Object.keys(authResult.sessionClaims.membership);
      if (membershipKeys.length > 0) {
        const orgId = membershipKeys[0];
        logger.debug({ orgId }, 'Got orgId from sessionClaims.membership');
        return orgId;
      }
    }

    // Strategy 3: Check custom header (set by middleware)
    try {
      const headersList = await headers();
      const orgIdFromHeader = headersList.get('x-clerk-org-id');
      if (orgIdFromHeader) {
        logger.debug(
          { orgId: orgIdFromHeader },
          'Got orgId from custom header'
        );
        return orgIdFromHeader;
      }
    } catch (headerError) {
      // Headers might not be available in all contexts
      logger.debug('Headers not available, trying next strategy');
    }

    // Strategy 4: Fallback to currentUser() and membership lookup
    // This is more expensive but guaranteed to work
    const userId = authResult.userId;
    if (!userId) {
      logger.warn('No userId found in auth context');
      return null;
    }

    const user = await currentUser();
    if (!user) {
      logger.warn('currentUser() returned null');
      return null;
    }

    // Strategy 5: Get organization from memberships
    const memberships = await (
      await clerkClient()
    ).users.getOrganizationMembershipList({
      userId: user.id,
    });

    const firstOrgId = memberships.data[0]?.organization?.id;
    if (firstOrgId) {
      logger.debug(
        { orgId: firstOrgId },
        'Got orgId from membership lookup (fallback)'
      );
      return firstOrgId;
    }

    logger.warn('No organization found for user');
    return null;
  } catch (error) {
    logger.error(
      { err: error },
      'Error in getOrgIdFromAuth, attempting final fallback'
    );

    // Final fallback: Try currentUser() directly
    try {
      const user = await currentUser();
      if (user) {
        const memberships = await (
          await clerkClient()
        ).users.getOrganizationMembershipList({
          userId: user.id,
        });
        const firstOrgId = memberships.data[0]?.organization?.id;
        if (firstOrgId) {
          logger.info(
            { orgId: firstOrgId },
            'Got orgId from emergency fallback'
          );
          return firstOrgId;
        }
      }
    } catch (fallbackError) {
      logger.error({ err: fallbackError }, 'Emergency fallback also failed');
    }

    return null;
  }
}

/**
 * Helper function that throws if no org ID is found
 */
export async function getOrgIdFromAuthOrThrow(): Promise<string> {
  const orgId = await getOrgIdFromAuth();

  if (!orgId) {
    throw new Error('Organization ID is required');
  }

  return orgId;
}
