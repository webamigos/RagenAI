'use server';

import * as Sentry from '@sentry/nextjs';
import { auth, currentUser } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

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

    const organization = await fetchOrganizationByProviderId(orgId);

    // by now organization have only one default project
    const defaultProject = await fetchOrganizationDefaultProject(
      organization.id
    );

    const user = await currentUser();

    const keyRecord = await db.apiKey.create({
      data: {
        name: data.name,
        masked_value: 'pending_*********',
        // created_by: user?.fullName || 'Org Person', // TODO: change?
        project_id: defaultProject.id,
        organization_id: organization.id,
      },
    });
    const apiBaseUrl = process.env.API_BASE_URL;
    if (!apiBaseUrl) {
      throw new Error('API_BASE_URL is not set');
    }

    const response = await fetch(`${apiBaseUrl}/v1/auth/generate-api-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orgId: organization.id,
        projectId: defaultProject.id,
        keyId: keyRecord.id,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate API key');
    }

    const { apiKey } = await response.json();
    const maskedKey = maskApiKey(apiKey);

    await db.apiKey.update({
      where: { id: keyRecord.id },
      data: { masked_value: maskedKey },
    });

    revalidatePath('/my-profile/api-keys');

    return {
      success: true,
      payload: {
        key: apiKey,
      },
    };
  } catch (error) {
    Sentry.captureException(error);

    // Log error with additional context
    logger.error(
      {
        extra: {
          sth: 'ok',
        },
        err: error,
      },
      'Failed to create API key 31'
    );

    return {
      success: false,
      message: 'Cannot create key',
    };
  }
};

createApiKey.displayName = 'createApiKey';

const maskApiKey = (apiKey: string): string => {
  if (typeof apiKey !== 'string' || apiKey.length < 10) {
    throw new Error('Invalid API key format');
  }

  const prefix = apiKey.slice(0, 5);
  const suffix = apiKey.slice(-3);
  return `${prefix}${'*'.repeat(6)}${suffix}`;
};
