import db from '@ragenai/prisma-client';
import type { InternalOrganization } from '@/generated/prisma/client';

export const createOrganizationWithDefaultProjectCommand = async (
  organizationProviderId: InternalOrganization['provider_id'],
  userId: string
) => {
  const organization = await db.$transaction(async (tx) => {
    const organization = await tx.internalOrganization.create({
      data: {
        provider_id: organizationProviderId,
      },
    });

    // create default project within the same transaction
    await tx.project.create({
      data: {
        title: 'Default',
        internal_organization_id: organization.id,
        organization_id: organizationProviderId,
        owner_id: userId,
      },
    });

    return organization;
  });

  return {
    id: organization.id,
    publicId: organization.public_id,
  };
};
