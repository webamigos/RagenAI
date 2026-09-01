'use server';

import db from '@ragenai/prisma-client';

export const getDefaultProjectIdQuery = async (organizationId: string) => {
  const result = await db.project.findFirst({
    where: {
      organizationId: organizationId,
    },
    select: {
      id: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return result?.id ?? null;
};
