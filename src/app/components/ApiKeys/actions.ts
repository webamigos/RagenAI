'use server';

import * as Sentry from '@sentry/nextjs';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUser,
} from '@/app/lib/utils/auth-helpers';

import {
  createOrganizationWithDefaultProject,
  fetchApiKeysFromDb,
} from '@/app/lib/services/apiKeys';
import {
  setSentryServiceTag,
  setSentryTagsAndContextForClerk,
} from '@/app/lib/services/sentry';

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
    setSentryServiceTag(serviceName);
    setSentryTagsAndContextForClerk({ sessionId: undefined, orgId, userId });

    const keys = await fetchApiKeysFromDb(orgId);

    return {
      success: true,
      payload: keys,
    };
  } catch (error) {
    Sentry.captureException(error);

    await createOrganizationWithDefaultProject(orgId, userId);

    return {
      success: true,
      payload: [],
    };
  }
};
