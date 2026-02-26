import db from '@ragenai/prisma-client';

export const getOrganizationDefaultProjectQuery = async (
  organizationId: string,
) => {
  return await db.project.findFirstOrThrow({
    where: {
      organization_id: organizationId,
    },
  });
};

export const getApiKeysQuery = async (organizationId: string) => {
  return await db.apiKey.findMany({
    where: {
      organization_id: organizationId,
    },
    select: {
      public_id: true,
      name: true,
      masked_value: true,
      created_at: true,
      project: {
        select: {
          public_id: true,
          title: true,
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
  });
};

// TODO: in the future we should implement fetching the API key from the pool, now we accept the risk of using the same key for all users
export const getApiKeyFromPool = () => {
  const apiKey = process.env.OPENAI_API_KEY!;
  return apiKey;
};
