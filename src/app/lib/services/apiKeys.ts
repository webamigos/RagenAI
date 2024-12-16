import db from '@ragenai/prisma-client';

import { ApiKey, type Organization, type Project } from '@prisma/client';

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

  return {
    id: organization.id,
    publicId: organization.public_id,
  };
};

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

/**
 * Consider if it's safe to pass organizationId by argument
 * Maybe it'd be safer to fetch it from clerk auth function here? 🤔
 *
 * @param organizationProviderId
 * @param apiKeyId
 */
export const removeApiKeyFromDb = async (
  organizationProviderId: Organization['provider_id'],
  apiKeyId: ApiKey['id']
) => {
  const organization = await fetchOrganizationByProviderId(
    organizationProviderId
  );

  // check if combination of organization and key id exists
  const apiKey = await db.apiKey.findUniqueOrThrow({
    where: {
      id: apiKeyId,
      organization_id: organization.id,
    },
  });

  return await db.apiKey.delete({
    where: {
      id: apiKey.id,
    },
  });
};
