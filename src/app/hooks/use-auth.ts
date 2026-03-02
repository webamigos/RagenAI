'use client';

import { useSession, useActiveOrganization } from './use-better-auth';
import {
  isAppAdmin as checkAppAdmin,
  isOrgAdmin as checkOrgAdmin,
} from '@/lib/auth-access-control';

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
    isAppAdmin: checkAppAdmin(session?.user),
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
    orgId: (session?.session as any)?.activeOrganizationId || null,
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
  // @ts-ignore - Better Auth types don't expose role/permissions yet
  const role = (org as any)?.role as string | undefined;

  return {
    organization: org || null,
    isLoaded: !isPending,
    membership: org
      ? {
          role: role,
          // @ts-ignore
          permissions: (org as any).permissions || [],
        }
      : null,
    isOrgAdmin: checkOrgAdmin(role),
  };
}
