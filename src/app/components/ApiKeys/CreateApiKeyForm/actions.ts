'use server';

import * as Sentry from '@sentry/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';

import db from '@salesyy/prisma-client';

import { ApiKeyDto } from './types';
import {
  setSentryServiceTag,
  setSentryTagsAndContextForClerk,
} from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';
import {
  fetchOrganizationByProviderId,
  fetchOrganizationDefaultProject,
} from '@/app/lib/services/apiKeys';

type SuccessResponse = {
  payload: {
    key: string;
  };
};

type FailResponse = {
  message: string;
};

type ActionResponse =
  | ({
      success: false;
    } & FailResponse)
  | ({
      success: true;
    } & SuccessResponse);

const serviceName = 'createKeyActions';

export const createApiKey = async (
  data: ApiKeyDto
): Promise<ActionResponse> => {
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

    throw new Error('Make Sentry great again second');

    const organization = await fetchOrganizationByProviderId(orgId);

    // by now organization have only one default project
    const defaultProject = await fetchOrganizationDefaultProject(
      organization.id
    );

    // TODO: make call to backend API for a api key
    const backendApiKey = 'sk-12345689'; // TODO: change after call to backend API

    const user = await currentUser();

    const keyRecord = await db.apiKey.create({
      data: {
        name: data.name,
        masked_value: 'sk_sdr*******nhg', // TODO: change after backend API call
        // created_by: user?.fullName || 'Org Person', // TODO: change?
        project_id: defaultProject.id,
        organization_id: organization.id,
      },
    });

    return {
      success: true,
      payload: {
        key: backendApiKey,
      },
    };
  } catch (error) {
    Sentry.captureException(error);

    // Log error with additional context
    logger.error(
      {
        err: error,
        userId,
        orgId,
        sessionId,
        service: serviceName,
        action: 'createApiKey',
      },
      'Failed to create API key'
    );

    return {
      success: false,
      message: 'Cannot create key',
    };
  }
};
