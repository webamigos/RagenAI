import db from '@ragenai/prisma-client';
import { DEFAULT_PROJECT_TITLE } from '../../constants/settings';

export const createOrganizationWithDefaultProjectCommand = async (
  organizationId: string,
  userId: string,
) => {
  await db.project.create({
    data: {
      title: DEFAULT_PROJECT_TITLE,
      organizationId: organizationId,
      ownerId: userId,
    },
  });

  return { organizationId };
};
