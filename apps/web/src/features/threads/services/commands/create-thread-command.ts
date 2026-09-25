'use server';

import { logger } from '@/app/lib/utils/logger';
import type { ThreadDocumentUI } from '@/features/documents/contracts/document.types';
import type { ThreadAction } from '../../contracts/thread.types';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import {
  getCurrentUserId,
  getOrgIdFromAuth,
} from '@/app/lib/utils/auth-helpers';
import {
  DEFAULT_KNOWLEDGE_SCOPE,
  type KnowledgeScope,
} from '@ragenai/platform-contracts';

/**
 * A Server Action — the client calls it directly, so nothing it is handed can
 * name the organization or the user. Both come from the session: the token
 * minted by `ragenApiRequest` is what apps/api trusts, so it must never carry
 * an `orgId`/`userId` the browser sent.
 */
export const createThreadAction = async (
  projectId?: string,
  mentionedProjectId?: string,
  preferredModel?: string,
  threadDocuments?: ThreadDocumentUI[],
  /**
   * Fixed for the thread's life — the composer picks it before the first
   * message and cannot change it afterwards. Omitted means `KNOWLEDGE_BASE`.
   */
  knowledgeScope?: KnowledgeScope,
): Promise<ThreadAction> => {
  const [orgId, userId] = await Promise.all([
    getOrgIdFromAuth(),
    getCurrentUserId(),
  ]);
  if (!orgId || !userId) {
    return { success: false, errorMessage: 'Cannot create thread' };
  }
  try {
    return await ragenApiRequest<ThreadAction>({
      method: 'POST',
      path: '/v1/internal/threads',
      userId,
      orgId,
      body: {
        projectId,
        mentionedProjectId,
        preferredModel,
        threadDocuments,
        // Sent only when it differs from the default, which shrinks a
        // deployment hazard that cannot be fixed where it belongs.
        //
        // apps/api validates with `forbidNonWhitelisted`, so an api that
        // predates `CreateThreadRequestDto.knowledgeScope` answers 400 to any
        // body carrying it — and thread creation is the core flow, so that is
        // an outage rather than a degraded feature. Railway has no primitive
        // for "deploy api before web" (its configuration cannot express an
        // inter-service dependency), so the order cannot be enforced in
        // configuration; it can only be written down and followed.
        //
        // Omitting the default value means the overwhelming majority of thread
        // creations send nothing new and keep working against an old api. What
        // remains is a handful of people who explicitly picked Assistant or
        // Just the model during the rollout window, which is a failed action
        // they can retry rather than a product that does not start.
        //
        // Omitting is exact, not a fudge: the column defaults to
        // KNOWLEDGE_BASE and the DTO treats an absent field as the same, so an
        // omitted default and an explicit one produce identical rows.
        ...(knowledgeScope && knowledgeScope !== DEFAULT_KNOWLEDGE_SCOPE
          ? { knowledgeScope }
          : {}),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Cannot create thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
