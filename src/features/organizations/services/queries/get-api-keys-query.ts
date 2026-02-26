import db from '@ragenai/prisma-client';
import type { InternalOrganization } from '@/generated/prisma/client';

export const getInternalOrganizationByProviderIdQuery = async (
  organizationProviderId: InternalOrganization['provider_id'],
) => {
  return await db.internalOrganization.findUniqueOrThrow({
    where: {
      provider_id: organizationProviderId,
    },
  });
};

export const getOrganizationDefaultProjectQuery = async (
  systemOrgId: InternalOrganization['id'],
) => {
  return await db.project.findFirstOrThrow({
    where: {
      internal_organization_id: systemOrgId,
    },
  });
};

export const getApiKeysQuery = async (
  organizationProviderId: InternalOrganization['provider_id'],
) => {
  const organization = await getInternalOrganizationByProviderIdQuery(
    organizationProviderId,
  );

  return await db.apiKey.findMany({
    where: {
      organization_id: organization.id,
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
