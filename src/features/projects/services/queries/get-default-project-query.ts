'use server';

import db from '@ragenai/prisma-client';

export const getDefaultProjectIdQuery = async (organizationId: string) => {
  const result = await db.project.findFirst({
    where: {
      organization_id: organizationId,
    },
    select: {
      id: true,
    },
    orderBy: { created_at: 'asc' },
  });

  return result?.id ?? null;
};

export const getDefaultProjectPublicIdQuery = async (
  organizationId: string,
) => {
  const result = await db.project.findFirst({
    where: {
      organization_id: organizationId,
    },
    select: {
      public_id: true,
    },
    orderBy: { created_at: 'asc' },
  });

  return result?.public_id ?? null;
};
