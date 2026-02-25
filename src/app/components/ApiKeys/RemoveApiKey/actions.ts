'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUser,
} from '@/app/lib/utils/auth-helpers';
import { removeApiKeyCommand as removeApiKeyFromDb } from '@/features/organizations/services/commands/remove-api-key-command';
import { ApiKey } from '@/generated/prisma/client';

const serviceName = 'removeApiKey';

export const removeApiKey = async (publicKeyId: ApiKey['public_id']) => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const user = await getCurrentUser();

  if (!orgId || !user?.id) {
    return {
      success: false,
      message: 'Organization or user not found',
    };
  } else if (!publicKeyId) {
    return {
      success: false,
      message: 'Key not found',
    };
  }

  const userId = user.id;

  try {
    await removeApiKeyFromDb(orgId, publicKeyId);

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
    };
  }
};
