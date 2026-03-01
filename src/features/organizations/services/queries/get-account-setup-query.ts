import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import type { AccountSetupStatus } from '../../contracts/organization.types';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';

const DEFAULT_PROJECT_TITLE = 'Default';

export async function getAccountSetupStatusQuery(
  userId?: string,
): Promise<AccountSetupStatus> {
  try {
    logger.info('Starting account setup status check');

    // If userId not provided, try to get current user
    let userIdToUse = userId;
    let userEmail: string | undefined;

    if (!userIdToUse) {
      const user = await getCurrentUser();
      if (!user) {
        logger.error('User not found');
        throw new Error('Cannot check account configuration, user not found');
      }
      userIdToUse = user.id;
      userEmail = user.email;
    }

    logger.info({ userId: userIdToUse, email: userEmail }, 'User found');

    const orgId = await getBetterAuthOrganizationId(userIdToUse);
    logger.info({ orgId }, 'Better Auth Organization ID retrieved');

    if (!orgId) {
      logger.warn('No Better Auth organization found for user');
      return {
        organizationExists: false,
        organizationHasSubscription: false,
        organizationHasDefaultProject: false,
        accountSetupComplete: false,
        organizationId: null,
      };
    }

    const [defaultProject, subscription] = await Promise.all([
      db.project.findFirst({
        where: { organization_id: orgId, title: DEFAULT_PROJECT_TITLE },
        select: { id: true },
      }),
      getSubscription(orgId),
    ]);

    const organizationHasSubscription =
      !!subscription && subscription.status === 'active';
    logger.info(
      {
        organizationHasSubscription,
        subscriptionStatus: subscription?.status,
      },
      'Check: Organization has active subscription',
    );

    const organizationHasDefaultProject = !!defaultProject;

    const accountSetupComplete =
      organizationHasSubscription && organizationHasDefaultProject;

    logger.info({ accountSetupComplete }, 'Final account setup status');

    return {
      organizationExists: true,
      organizationHasSubscription,
      organizationHasDefaultProject,
      accountSetupComplete,
      organizationId: orgId,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error checking user account configuration');
    throw error;
  }
}

//Our system takes the first organization as a default
async function getBetterAuthOrganizationId(
  userId: string,
): Promise<string | null> {
  try {
    logger.info({ userId }, 'Fetching Better Auth organization memberships');

    // @ts-ignore - Better Auth types don't expose listOrganizations yet
    const memberships = await (auth.api as any).listOrganizations({
      headers: await headers(),
    });

    logger.info(
      {
        membershipCount: memberships?.length,
        firstOrgId: memberships?.[0]?.id,
      },
      'Better Auth memberships retrieved',
    );

    return memberships?.[0]?.id || null;
  } catch (error) {
    logger.error({ err: error }, 'Error getting organization ID');
    throw error;
  }
}

async function getSubscription(referenceId: string) {
  try {
    return await db.subscription.findFirst({
      where: { referenceId },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting subscription');
    throw error;
  }
}
