'use server';

import * as Sentry from '@sentry/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';

import db from '@salesyy/prisma-client';

import { ApiKeyDto } from './types';
import {
  setSentryContext,
  setSentryOrganizationTag,
  setSentryServiceTag,
  setSentrySessionTag,
  setSentryUserId,
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
    setSentryUserId(userId);
    setSentrySessionTag(sessionId);
    setSentryOrganizationTag(orgId);
    setSentryServiceTag(serviceName);
    setSentryContext(serviceName, 'createApiKey', {
      organization: orgId,
      ...data,
    });

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
        created_by: user?.fullName || 'Org Person', // TODO: change
        project_id: defaultProject.id,
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
