'use server';

import * as Sentry from '@sentry/nextjs';
import { auth } from '@clerk/nextjs/server';

import {
  createOrganizationWithDefaultProject,
  fetchOrganizationByProviderId,
} from '@/app/lib/services/apiKeys';
import {
  setSentryServiceTag,
  setSentryTagsAndContextForClerk,
} from '@/app/lib/services/sentry';

const serviceName = 'apiKeySynchronizer';

export const syncOrganizationAndProject = async () => {
  const { orgId, userId, sessionId } = auth();

  if (!orgId) {
    return {
      success: false,
      message: 'Organization not found',
    };
  }

  try {
    setSentryServiceTag(serviceName);
    setSentryTagsAndContextForClerk({ sessionId, orgId, userId });

    await fetchOrganizationByProviderId(orgId);
  } catch (error) {
    Sentry.captureException(error);

    // organization doesn't exists - create one using transaction
    await createOrganizationWithDefaultProject(orgId);
  }
};
