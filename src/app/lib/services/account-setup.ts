import { currentUser, clerkClient } from '@clerk/nextjs/server';
import { AccountSetupStatus } from '../types/account-setup';
import db from '@ragenai/prisma-client';
import { PlanStatus } from '@prisma/client';
import { logger } from '../utils/logger';

const DEFAULT_PROJECT_TITLE = 'Default';

export async function getAccountSetupStatus(): Promise<AccountSetupStatus> {
  try {
    const user = await currentUser();
    if (!user) {
      throw new Error('Cannot check account configuration, user not found');
    }

    const orgId = await getClerkOrganizationId(user.id);
    if (!orgId) {
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

    const internalOrganizationExists = !!internalOrganization;
    const organizationHasSubscription =
      internalOrganization?.subscription?.plan.status === PlanStatus.ACTIVE;
    const organizationHasDefaultProject = Boolean(
      internalOrganization?.project.some(
        (project) => project.title === DEFAULT_PROJECT_TITLE
      )
    );

    const accountSetupComplete =
      internalOrganizationExists &&
      organizationHasSubscription &&
      organizationHasDefaultProject;

    return {
      clerkOrganizationExists: true,
      internalOrganizationExists,
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
async function getClerkOrganizationId(userId: string): Promise<string | null> {
  try {
    const memberships = await clerkClient?.users?.getOrganizationMembershipList(
      {
        userId,
      }
    );

    const organization = memberships?.data[0]?.organization;
    return organization?.id || null;
  } catch (error) {
    logger.error({ err: error }, 'Error getting organization ID');
    throw error;
  }
}

async function getInternalOrganization(orgId: string) {
  try {
    return await db.organization.findFirst({
      where: {
        provider_id: orgId,
      },
      select: {
        subscription: {
          include: {
            plan: true,
          },
        },
        project: true,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error getting internal organization');
    throw error;
  }
}
