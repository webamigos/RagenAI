import db from '@ragenai/prisma-client';

export const getOrganizationDefaultProjectQuery = async (
  organizationId: string,
) => {
  return await db.project.findFirstOrThrow({
    where: {
      organizationId: organizationId,
    },
  });
};

export const getApiKeysQuery = async (organizationId: string) => {
  return await db.apiKey.findMany({
    where: {
      organizationId: organizationId,
    },
    select: {
      id: true,
      name: true,
      maskedValue: true,
      isActive: true,
      createdAt: true,
      project: {
        select: {
          id: true,
          title: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

// TODO: in the future we should implement fetching the API key from the pool, now we accept the risk of using the same key for all users
export const getApiKeyFromPool = () => {
  const apiKey = process.env.OPENAI_API_KEY!;
  return apiKey;
};
