'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUser,
} from '@/app/lib/utils/auth-helpers';

import {
  createOrganizationWithDefaultProject,
  fetchApiKeysFromDb,
} from '@/app/lib/services/apiKeys';

const serviceName = 'apiKeysList';

export const fetchApiKeys = async () => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const user = await getCurrentUser();

  if (!orgId || !user?.id) {
    return {
      success: false,
      message: 'Organization or user not found',
    };
  }

  const userId = user.id;

  try {
    const keys = await fetchApiKeysFromDb(orgId);

    return {
      success: true,
      payload: keys,
    };
  } catch (error) {
    await createOrganizationWithDefaultProject(orgId, userId);

    return {
      success: true,
      payload: [],
    };
  }
};
