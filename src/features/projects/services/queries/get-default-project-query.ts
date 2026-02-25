'use server';

import db from '@ragenai/prisma-client';

export const getDefaultProjectIdQuery = async (clerkOrgId: string) => {
  const result = await db.internalOrganization.findFirst({
    where: {
      provider_id: clerkOrgId,
    },
    select: {
      project: {
        select: {
          id: true,
        },
        take: 1,
      },
    },
  });

  return result?.project[0]?.id ?? null;
};

export const getDefaultProjectPublicIdQuery = async (clerkOrgId: string) => {
  const result = await db.internalOrganization.findFirst({
    where: {
      provider_id: clerkOrgId,
    },
    select: {
      project: {
        select: {
          public_id: true,
        },
        take: 1,
      },
    },
  });

  return result?.project[0]?.public_id ?? null;
};
