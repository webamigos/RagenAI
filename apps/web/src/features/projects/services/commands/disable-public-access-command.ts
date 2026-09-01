'use server';

import { logger } from '@/app/lib/utils/logger';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

/**
 * Cut over to apps/api's `POST /v1/internal/projects/:id/disable-public-access`
 * (see docs/adrs/21-monorepo-and-api-decoupling.md, Phase C UI cutover) —
 * called directly from `useDisablePublicAccess.ts`, not routed through
 * `src/app/actions/index.ts`. `ProjectsService.disablePublicAccess`
 * already enforces the same `requireProjectAccess(projectId, 'owner')`
 * check this command did locally.
 */
export const disablePublicAccessCommand = async (projectId: string) => {
  try {
    const [orgId, userId] = await Promise.all([
      getOrgIdFromAuthOrThrow(),
      getCurrentUserId(),
    ]);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    const result = await ragenApiRequest<{ success: boolean }>({
      method: 'POST',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/disable-public-access`,
      userId,
      orgId,
    });

    logger.info({ projectId }, 'Public access disabled successfully');
    return result;
  } catch (error) {
    logger.error({ err: error }, 'Error disabling public access');
    throw error;
  }
};
