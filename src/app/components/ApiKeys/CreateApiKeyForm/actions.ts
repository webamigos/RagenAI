'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUser,
} from '@/app/lib/utils/auth-helpers';
import { revalidatePath } from 'next/cache';

import db from '@ragenai/prisma-client';

import { type ApiKeyDto } from './types';
import { logger } from '@/app/lib/utils/logger';
import { ApiKeysService } from '@/app/api/v1/__logic__/services/api-keys.service';
import {
  type OrgId,
  type UserId,
  type ProjectId,
  type KeyId,
} from '@/app/api/v1/__logic__/types/brand';
import { getProjectByPublicIdQuery as getProjectByPublicId } from '@/features/projects/services/queries/get-project-query';

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

export const createApiKey = async (
  data: ApiKeyDto,
): Promise<ActionResponse> => {
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
    const userProject = await getProjectByPublicId(data.project_id);
    if (!userProject || userProject.owner_id !== userId) {
      throw new Error('Not allowed!');
    }

    const keyRecord = await db.apiKey.create({
      data: {
        name: data.name,
        masked_value: 'pending_*********',
        project_id: userProject.id,
        organization_id: orgId,
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

    const { apiKey, hashedKey } = hashResult;
    const maskedKey = maskApiKey(apiKey);

    await db.apiKey.update({
      where: { id: keyRecord.id },
      data: { masked_value: maskedKey, hashed_value: hashedKey },
    });

    revalidatePath('/my-profile/api-keys');

    return {
      success: true,
      payload: {
        key: apiKey,
      },
    };
  } catch (error) {
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
