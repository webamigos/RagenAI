import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { cache } from 'react';
import { logger } from './logger';

// Re-export centralized guards for convenience
export {
  isAppAdmin,
  isOrgAdmin,
  getActiveMember,
  requireAppAdmin,
  requireOrgAdmin,
  requireOrgOwner,
} from '@/lib/auth-guards';

/**
 * Get organization ID from Better Auth session
 *
 * Much simpler than Clerk version - Better Auth works properly with Next.js 15!
 * No need for complex fallback strategies.
 */
export const getOrgIdFromAuth = cache(async (): Promise<string | null> => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      logger.warn('No user session found');
      return null;
    }

    // Better Auth stores active organization in session
    // @ts-ignore - Better Auth types don't expose activeOrganizationId yet
    const orgId = session.activeOrganizationId;

    if (orgId) {
      logger.debug({ orgId }, 'Got orgId from session');
      return orgId;
    }

    // Fallback: Get user's first organization
    // @ts-ignore - Better Auth types don't expose listOrganizations yet
    const memberships = await (auth.api as any).listOrganizations({
      headers: await headers(),
    });

    const firstOrgId = memberships?.[0]?.id;
    if (firstOrgId) {
      logger.debug({ orgId: firstOrgId }, 'Got orgId from first membership');
      return firstOrgId;
    }

    logger.warn('No organization found for user');
    return null;
  } catch (error) {
    logger.error({ err: error }, 'Error in getOrgIdFromAuth');
    return null;
  }
});

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

/**
 * Get current user from Better Auth session
 */
export const getCurrentUser = cache(async () => {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    return session?.user || null;
  } catch (error) {
    logger.error({ err: error }, 'Error getting current user');
    return null;
  }
});

/**
 * Get current user ID
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const user = await getCurrentUser();
  return user?.id || null;
});
