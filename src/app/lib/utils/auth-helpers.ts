import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { cache } from 'react';
import { logger } from './logger';

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
    const orgId = session.activeOrganizationId;

    if (orgId) {
      logger.debug({ orgId }, 'Got orgId from session');
      return orgId;
    }

    // Fallback: Get user's first organization
    const memberships = await auth.api.listOrganizations({
      headers: await headers(),
      query: {
        userId: session.user.id,
      },
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

/**
 * Check if user has specific role in organization
 */
export async function hasOrganizationRole(
  userId: string,
  organizationId: string,
  role: 'owner' | 'admin' | 'member'
): Promise<boolean> {
  try {
    const org = await auth.api.getFullOrganization({
      headers: await headers(),
      query: { organizationId },
    });

    const member = org?.members?.find((m: any) => m.userId === userId);
    return member?.role === role;
  } catch (error) {
    logger.error({ err: error }, 'Error checking organization role');
    return false;
  }
}

/**
 * Check if user is admin or owner
 */
export async function isOrganizationAdmin(
  userId: string,
  organizationId: string
): Promise<boolean> {
  try {
    const org = await auth.api.getFullOrganization({
      headers: await headers(),
      query: { organizationId },
    });

    const member = org?.members?.find((m: any) => m.userId === userId);
    return member?.role === 'admin' || member?.role === 'owner';
  } catch (error) {
    logger.error({ err: error }, 'Error checking admin role');
    return false;
  }
}
