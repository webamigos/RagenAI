import db from '@ragenai/prisma-client';

export const createOrganizationWithDefaultProjectCommand = async (
  organizationId: string,
  userId: string,
) => {
  await db.project.create({
    data: {
      title: 'Default',
      organization_id: organizationId,
      owner_id: userId,
    },
  });

  return { organizationId };
};
