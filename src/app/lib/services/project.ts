import db from '@salesyy/prisma-client';

export const fetchOrganizationDefaultProjectId = async (clerkOrgId: string) => {
  const result = await db.organization.findFirst({
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
