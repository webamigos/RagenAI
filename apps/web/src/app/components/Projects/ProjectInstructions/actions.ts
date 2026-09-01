'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import { logger } from '@/app/lib/utils/logger';

export async function saveProjectInstructionAction(
  projectId: string,
  instruction: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const [orgId, userId] = await Promise.all([
      getOrgIdFromAuthOrThrow(),
      getCurrentUserId(),
    ]);
    if (!userId) {
      return { success: false, message: 'Not authenticated' };
    }
    await ragenApiRequest({
      method: 'PUT',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/instruction`,
      userId,
      orgId,
      body: { instruction },
    });
    return { success: true, message: 'Instruction saved successfully' };
  } catch (error) {
    logger.error({ err: error }, 'Failed to save project instruction');
    return { success: false, message: 'Failed to save project instruction' };
  }
}

export async function getProjectInstructionAction(
  projectId: string,
): Promise<{ success: boolean; instruction: string | null; message?: string }> {
  try {
    const [orgId, userId] = await Promise.all([
      getOrgIdFromAuthOrThrow(),
      getCurrentUserId(),
    ]);
    if (!userId) {
      return {
        success: false,
        instruction: null,
        message: 'Not authenticated',
      };
    }
    const result = await ragenApiRequest<{ instruction: string | null }>({
      method: 'GET',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/instruction`,
      userId,
      orgId,
    });
    return { success: true, instruction: result.instruction };
  } catch (error) {
    logger.error({ err: error }, 'Failed to get project instruction');
    return {
      success: false,
      instruction: null,
      message: 'Failed to fetch project instruction',
    };
  }
}
