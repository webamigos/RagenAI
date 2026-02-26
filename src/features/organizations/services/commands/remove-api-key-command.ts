import db from '@ragenai/prisma-client';
import type { ApiKey } from '@/generated/prisma/client';

export const removeApiKeyCommand = async (
  organizationId: string,
  publicApiKeyId: ApiKey['public_id'],
) => {
  const apiKey = await db.apiKey.findUniqueOrThrow({
    where: {
      public_id: publicApiKeyId,
      organization_id: organizationId,
    },
  });

  return await db.apiKey.delete({
    where: {
      id: apiKey.id,
    },
  });
};
