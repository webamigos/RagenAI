'use server';

import * as Sentry from '@sentry/nextjs';
import { auth } from '@clerk/nextjs/server';
import { revalidatePath } from 'next/cache';

import db from '@ragenai/prisma-client';

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
import { ApiKeysService } from '@/app/api/v1/__logic__/services/api-keys.service';
import {
  OrgId,
  UserId,
  ProjectId,
  KeyId,
} from '@/app/api/v1/__logic__/types/brand';
import { fetchProject } from '@/app/lib/services/api';
import { getProjectByPublicId } from '@/app/lib/services/project';

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

    const userProject = await getProjectByPublicId(data.project_id);
    if (!userProject || userProject.owner_id !== userId) {
      throw new Error('Not allowed!');
    }

    const organization = await fetchOrganizationByProviderId(orgId);

    const keyRecord = await db.apiKey.create({
      data: {
        name: data.name,
        masked_value: 'pending_*********',
        project_id: userProject.id,
        organization_id: organization.id,
      },
    });

    // Moved logic from Nest.js temporary here
    const apiKeysService = new ApiKeysService();

    const keyPayload = {
      orgId: orgId as OrgId,
      userId: userId as UserId,
      projectId: userProject.id as ProjectId,
      keyId: keyRecord.id as KeyId,
    };

    const hashResult = await apiKeysService.createAndHash(keyPayload);

    // TODO: previous version with NestJS app
    // const response = await fetch(`${apiBaseUrl}/v1/auth/generate-api-key`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     orgId: organization.id,
    //     projectId: defaultProject.id,
    //     keyId: keyRecord.id,
    //   }),
    // });

    const { apiKey } = hashResult;
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
    logger.error({ err: error }, 'Failed to create API key');

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
