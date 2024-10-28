'use server';

import * as Sentry from '@sentry/nextjs';
import { auth } from '@clerk/nextjs/server';

import {
  createOrganizationWithDefaultProject,
  fetchOrganizationByProviderId,
} from '@/app/lib/services/apiKeys';
import {
  setSentryContext,
  setSentryOrganizationTag,
  setSentryServiceTag,
  setSentrySessionTag,
  setSentryUserId,
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
    setSentryUserId(userId);
    setSentrySessionTag(sessionId);
    setSentryOrganizationTag(orgId);
    setSentryServiceTag(serviceName);
    setSentryContext(serviceName, 'syncOrganizationAndProject', {
      organization: orgId,
    });

    await fetchOrganizationByProviderId(orgId);
  } catch (error) {
    Sentry.captureException(error);

    // organization doesn't exists - create one using transaction
    await createOrganizationWithDefaultProject(orgId);
  }
};
