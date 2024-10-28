import db from '@salesyy/prisma-client';

import { type Organization, type Project } from '@prisma/client';

export const fetchOrganizationByProviderId = async (
  organizationProviderId: Organization['provider_id']
) => {
  return await db.organization.findUniqueOrThrow({
    where: {
      provider_id: organizationProviderId,
    },
  });
};

export const fetchOrganizationDefaultProject = async (
  systemOrgId: Organization['id']
) => {
  return await db.project.findFirstOrThrow({
    where: {
      organization_id: systemOrgId,
    },
  });
};

export const createOrganizationWithDefaultProject = async (
  organizationProviderId: Organization['provider_id']
) => {
  const organization = await db.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: {
        provider_id: organizationProviderId,
      },
    });

    // create default project within the same transaction
    await tx.project.create({
      data: {
        title: 'Default',
        organization_id: organization.id,
      },
    });

    return organization;
  });
};

/**
 * TODO: optimize
 *
 * @param organizationProviderId
 * @returns
 */
export const fetchApiKeysFromDb = async (
  organizationProviderId: Organization['provider_id']
) => {
  const organization = await fetchOrganizationByProviderId(
    organizationProviderId
  );

  // TODO: not necessary now
  // const defaultProject = await fetchOrganizationDefaultProject(
  //   organization['id']
  // );

  return await db.apiKey.findMany({
    where: {
      organization_id: organization.id,
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};
