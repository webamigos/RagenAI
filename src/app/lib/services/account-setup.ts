import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { AccountSetupStatus } from '../types/account-setup';
import db from '@ragenai/prisma-client';
import { PlanStatus } from '@/generated/prisma/client';
import { logger } from '../utils/logger';
import { getCurrentUser } from '../utils/auth-helpers';

const DEFAULT_PROJECT_TITLE = 'Default';

export async function getAccountSetupStatus(
  userId?: string
): Promise<AccountSetupStatus> {
  try {
    logger.info('🔍 Starting account setup status check');

    // If userId not provided, try to get current user
    let userIdToUse = userId;
    let userEmail: string | undefined;

    if (!userIdToUse) {
      const user = await getCurrentUser();
      if (!user) {
        logger.error('❌ User not found');
        throw new Error('Cannot check account configuration, user not found');
      }
      userIdToUse = user.id;
      userEmail = user.email;
    }

    logger.info({ userId: userIdToUse, email: userEmail }, '✅ User found');

    const orgId = await getBetterAuthOrganizationId(userIdToUse);
    logger.info({ orgId }, 'Better Auth Organization ID retrieved');

    if (!orgId) {
      logger.warn('⚠️ No Clerk organization found for user');
      return {
        clerkOrganizationExists: false,
        internalOrganizationExists: false,
        organizationHasSubscription: false,
        organizationHasDefaultProject: false,
        accountSetupComplete: false,
        organizationId: null,
      };
    }

    const internalOrganization = await getInternalOrganization(orgId);
    logger.info(
      {
        internalOrgId: internalOrganization?.id,
        hasSubscription: !!internalOrganization?.subscription,
        projectCount: internalOrganization?.project?.length,
      },
      'Internal organization data'
    );

    const internalOrganizationExists = !!internalOrganization;
    logger.info(
      { internalOrganizationExists },
      'Check: Internal organization exists'
    );

    const organizationHasSubscription =
      internalOrganization?.subscription?.plan.status === PlanStatus.ACTIVE;
    logger.info(
      {
        organizationHasSubscription,
        subscriptionStatus: internalOrganization?.subscription?.status,
        planStatus: internalOrganization?.subscription?.plan.status,
      },
      'Check: Organization has active subscription'
    );

    const organizationHasDefaultProject = Boolean(
      internalOrganization?.project.some(
        (project) => project.title === DEFAULT_PROJECT_TITLE
      )
    );
    logger.info(
      {
        organizationHasDefaultProject,
        projects: internalOrganization?.project?.map((p) => ({
          id: p.id,
          title: p.title,
        })),
      },
      'Check: Organization has default project'
    );

    const accountSetupComplete =
      internalOrganizationExists &&
      organizationHasSubscription &&
      organizationHasDefaultProject;

    logger.info({ accountSetupComplete }, '🏁 Final account setup status');

    const result = {
      clerkOrganizationExists: true,
      internalOrganizationExists,
      organizationHasSubscription,
      organizationHasDefaultProject,
      accountSetupComplete,
      organizationId: orgId,
    };

    logger.info({ result }, '📊 Complete status object');

    return result;
  } catch (error) {
    logger.error({ err: error }, 'Error checking user account configuration');
    throw error;
  }
}

//Our system takes the first organization as a default
async function getBetterAuthOrganizationId(
  userId: string
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
      'Better Auth memberships retrieved'
    );

    return memberships?.[0]?.id || null;
  } catch (error) {
    logger.error({ err: error }, 'Error getting organization ID');
    throw error;
  }
}

async function getInternalOrganization(orgId: string) {
  try {
    logger.info({ orgId }, 'Querying database for internal organization');

    const org = await db.internalOrganization.findFirst({
      where: {
        provider_id: orgId,
      },
      select: {
        id: true,
        provider_id: true,
        subscription: {
          include: {
            plan: true,
          },
        },
        project: true,
      },
    });

    logger.info(
      {
        found: !!org,
        orgId: org?.id,
        providerId: org?.provider_id,
        hasSubscription: !!org?.subscription,
        projectCount: org?.project?.length,
      },
      'Database query result'
    );

    return org;
  } catch (error) {
    logger.error({ err: error }, 'Error getting internal organization');
    throw error;
  }
}
