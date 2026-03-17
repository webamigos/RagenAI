import db from '@ragenai/prisma-client';

export const createOrganizationWithDefaultProjectCommand = async (
  organizationId: string,
  userId: string,
) => {
  await db.project.create({
    data: {
      title: 'Default',
      organizationId: organizationId,
      ownerId: userId,
    },
  });

  return { organizationId };
};
