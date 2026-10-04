'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import { logger } from '@/app/lib/utils/logger';

/**
 * The assistant's "answer only from documents" row (spec
 * 2026-10-03-retrieval-claims-match-the-product-before-launch, C2).
 *
 * Organization and user come from the session, never from the caller. apps/api
 * checks the project against both: viewing needs `canView`, saving needs
 * `manage`, the same level as the assistant's instructions.
 */
export type AnswerFromDocumentsOnlyState = {
  /** What is stored; `null` until someone sets it. */
  setting: boolean | null;
  chatbotEnabled: boolean;
  /** What a turn uses: the setting, or the surface default when unset. */
  effective: boolean;
  canManage: boolean;
};

export async function getAnswerFromDocumentsOnlyAction(
  projectId: string,
): Promise<AnswerFromDocumentsOnlyState | null> {
  try {
    const [orgId, userId] = await Promise.all([
      getOrgIdFromAuthOrThrow(),
      getCurrentUserId(),
    ]);
    if (!userId) {
      return null;
    }
    return await ragenApiRequest<AnswerFromDocumentsOnlyState>({
      method: 'GET',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/answer-from-documents-only`,
      userId,
      orgId,
    });
  } catch (error) {
    logger.error(
      { err: error },
      'Failed to get the answer-from-documents-only setting',
    );
    return null;
  }
}

export async function saveAnswerFromDocumentsOnlyAction(
  projectId: string,
  answerFromDocumentsOnly: boolean,
): Promise<{ success: boolean }> {
  try {
    if (typeof answerFromDocumentsOnly !== 'boolean') {
      return { success: false };
    }
    const [orgId, userId] = await Promise.all([
      getOrgIdFromAuthOrThrow(),
      getCurrentUserId(),
    ]);
    if (!userId) {
      return { success: false };
    }
    await ragenApiRequest<{ success: boolean }>({
      method: 'PUT',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/answer-from-documents-only`,
      userId,
      orgId,
      body: { answerFromDocumentsOnly },
    });
    return { success: true };
  } catch (error) {
    logger.error(
      { err: error },
      'Failed to save the answer-from-documents-only setting',
    );
    return { success: false };
  }
}
