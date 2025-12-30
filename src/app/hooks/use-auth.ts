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
          role: org.role,
          permissions: org.permissions || [],
        }
      : null,
  };
}

/**
 * Compatibility stub for Clerk's useClerk hook
 *
 * Provides minimal compatibility for code that needs to be migrated
 * TODO: Remove this once all Clerk-specific code is fully migrated
 */
export function useClerk() {
  const { data: org } = useActiveOrganization();

  return {
    // Stub for clerk.setActive() - Better Auth handles this differently
    setActive: async ({ organization }: { organization?: string }) => {
      // eslint-disable-next-line no-console
      console.warn(
        '[useClerk] setActive is deprecated - Better Auth handles organization switching differently'
      );
      // TODO: Implement Better Auth organization switching if needed
    },
    // Stub for clerk.organization
    organization: org
      ? {
          publicMetadata: (org as any).publicMetadata || {},
          reload: async () => {
            // eslint-disable-next-line no-console
            console.warn(
              '[useClerk] organization.reload() is deprecated - use refetch instead'
            );
            // TODO: Implement refetch logic if needed
          },
        }
      : null,
  };
}
