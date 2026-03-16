import db from '@ragenai/prisma-client';
import type { ApiKey } from '@/generated/prisma/client';

export const removeApiKeyCommand = async (
  organizationId: string,
  publicApiKeyId: ApiKey['publicId'],
) => {
  const apiKey = await db.apiKey.findUniqueOrThrow({
    where: {
      publicId: publicApiKeyId,
      organizationId: organizationId,
    },
  });

  return await db.apiKey.delete({
    where: {
      id: apiKey.id,
    },
  });
};
