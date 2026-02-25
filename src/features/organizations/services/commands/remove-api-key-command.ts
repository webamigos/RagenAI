import db from '@ragenai/prisma-client';
import type { ApiKey, InternalOrganization } from '@/generated/prisma/client';
import { getInternalOrganizationByProviderIdQuery } from '../queries/get-api-keys-query';

/**
 * Consider if it's safe to pass organizationId by argument
 * Maybe it'd be safer to fetch it from Better Auth session here?
 */
export const removeApiKeyCommand = async (
  organizationProviderId: InternalOrganization['provider_id'],
  publicApiKeyId: ApiKey['public_id']
) => {
  const organization = await getInternalOrganizationByProviderIdQuery(
    organizationProviderId
  );

  // check if combination of organization and key id exists
  const apiKey = await db.apiKey.findUniqueOrThrow({
    where: {
      public_id: publicApiKeyId,
      organization_id: organization.id,
    },
  });

  return await db.apiKey.delete({
    where: {
      id: apiKey.id,
    },
  });
};
