'use server';

import db from '@ragenai/prisma-client';
import { PlanStatus } from '@prisma/client';
import { currentUser, clerkClient, auth } from '@clerk/nextjs/server';

export type AccountConfigurationResponse = {
  clerkOrganizationExists: boolean;
  internalOrganizationExists: boolean;
  organizationHasSubscription: boolean;
  organizationHasDefaultProject: boolean;
  accountSetupComplete: boolean;
  organizationId: string;
};

export async function checkUserAccountConfiguration(): Promise<AccountConfigurationResponse> {
  const user = await currentUser();
  const { sessionId } = await auth();

  if (!user || !sessionId) {
    throw new Error('Cannot check user account configuration, user not found');
  }

  const memberships = await clerkClient?.users?.getOrganizationMembershipList({
    userId: user.id,
  });

  const clerkOrganization = memberships.data[0]?.organization;

  const orgId = clerkOrganization?.id;

  if (!orgId) {
    return {
      clerkOrganizationExists: true,
      internalOrganizationExists: false,
      organizationHasSubscription: false,
      organizationHasDefaultProject: false,
      accountSetupComplete: false,
      organizationId: orgId,
    };
  }

  const organization = await db.organization.findFirst({
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

  const internalOrganizationExists = !!organization;
  const organizationHasSubscription =
    organization?.subscription?.plan.status === PlanStatus.ACTIVE;
  const organizationHasDefaultProject = Boolean(
    organization?.project.some((project) => project.title === 'Default')
  );

  const accountSetupComplete =
    !!orgId &&
    internalOrganizationExists &&
    organizationHasSubscription &&
    organizationHasDefaultProject;

  return {
    clerkOrganizationExists: !!orgId,
    internalOrganizationExists,
    organizationHasSubscription,
    organizationHasDefaultProject,
    accountSetupComplete,
    organizationId: orgId,
  };
}
