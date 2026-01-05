'use client';

import { useSession, useActiveOrganization } from './use-better-auth';

/**
 * Replacement for Clerk's useUser hook
 *
 * Returns user data and loading state in a format compatible with Clerk
 */
export function useUser() {
  const { data: session, isPending } = useSession();

  return {
    user: session?.user || null,
    isLoaded: !isPending,
    isSignedIn: !!session?.user,
  };
}

/**
 * Replacement for Clerk's useAuth hook
 *
 * Returns authentication state including userId and organization ID
 */
export function useAuth() {
  const { data: session, isPending } = useSession();

  return {
    userId: session?.user?.id || null,
    // @ts-ignore - Better Auth types don't expose activeOrganizationId yet
    orgId: session?.activeOrganizationId || null,
    isLoaded: !isPending,
    isSignedIn: !!session?.user,
    sessionId: session?.session?.id || null,
  };
}

/**
 * Replacement for Clerk's useOrganization hook
 *
 * Returns active organization data and membership info
 */
export function useOrganization() {
  const { data: org, isPending } = useActiveOrganization();

  return {
    organization: org || null,
    isLoaded: !isPending,
    membership: org
      ? {
          // @ts-ignore - Better Auth types don't expose role/permissions yet
          role: (org as any).role,
          // @ts-ignore
          permissions: (org as any).permissions || [],
        }
      : null,
  };
}
