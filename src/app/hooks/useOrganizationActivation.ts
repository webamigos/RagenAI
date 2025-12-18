'use client';

import { useEffect, useRef } from 'react';
import { useAuth, useClerk } from '@clerk/nextjs';
import { logger } from '@/app/lib/utils/logger';

/**
 * Hook that ensures user has an active organization set after sign-in/sign-up
 * This fixes the root cause where organization is null despite user having memberships
 *
 * ROOT CAUSE FIX: Next.js 15 + Clerk v6 doesn't automatically set active organization
 * after sign-in/sign-up, causing useOrganization() to return null
 */
export function useOrganizationActivation() {
  const { userId, orgId, isLoaded } = useAuth();
  const clerk = useClerk();
  const activationAttemptedRef = useRef(false);

  useEffect(() => {
    const activateOrganization = async () => {
      // Only run once when auth is loaded
      if (!isLoaded || activationAttemptedRef.current) return;

      // User must be signed in
      if (!userId) return;

      // If orgId already set, nothing to do
      if (orgId) {
        logger.info({ orgId }, 'Organization already active');
        return;
      }

      activationAttemptedRef.current = true;

      try {
        // Get user's organization memberships
        const user = clerk.user;
        const memberships = user?.organizationMemberships;

        if (!memberships || memberships.length === 0) {
          logger.warn('User has no organization memberships');
          return;
        }

        // Get the first organization (our system uses single org per user)
        const firstOrgId = memberships[0].organization.id;

        logger.info({ firstOrgId }, 'Setting active organization');

        // Set the active organization
        await clerk.setActive({ organization: firstOrgId });

        logger.info({ firstOrgId }, 'Active organization set successfully');
      } catch (error) {
        logger.error({ err: error }, 'Failed to set active organization');
      }
    };

    activateOrganization();
  }, [isLoaded, userId, orgId, clerk]);
}
