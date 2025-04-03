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

  let success = false;

  try {
    setSentryServiceTag(serviceName);
    setSentryTagsAndContextForClerk({ sessionId, orgId, userId });

    // if does not exist then an error is thrown and cached line below
    const organization = await fetchOrganizationByProviderId(orgId);
    if (organization.public_id) {
      success = true;
    }
  } catch (error) {
    Sentry.captureException(error);

    // organization doesn't exists - create one using transaction
    const { publicId } = await createOrganizationWithDefaultProject(
      orgId,
      userId
    );

    if (publicId) {
      success = true;
    }
  }

  return { success };
};
