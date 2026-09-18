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
      debugMode: true,
      createdAt: true,
      knowledgeScope: true,
      projectId: true,
      // The scope is only legible with the assistant's name next to it; the
      // id alone tells a reader nothing about what the key can reach.
      project: { select: { title: true } },
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
