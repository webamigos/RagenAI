'use server';

import { logger } from '@/app/lib/utils/logger';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

/**
 * Cut over to apps/api's `POST /v1/internal/projects/:id/generate-key`
 * (see docs/adrs/21-monorepo-and-api-decoupling.md, Phase C UI cutover) —
 * called directly from `useProjectKeyGenerator.ts`, not routed through
 * `src/app/actions/index.ts`. `ProjectsService.generateProjectKey`
 * already enforces the same `requireProjectAccess(projectId, 'owner')`
 * check this command did locally, and also already tracks the audit log
 * entry this command used to track separately.
 */
export const generateProjectKeyCommand = async (projectId: string) => {
  try {
    const [orgId, userId] = await Promise.all([
      getOrgIdFromAuthOrThrow(),
      getCurrentUserId(),
    ]);
    if (!userId) {
      throw new Error('Not authenticated');
    }

    logger.info('Generating access token for project');

    return await ragenApiRequest<{ accessToken: string | null }>({
      method: 'POST',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/generate-key`,
      userId,
      orgId,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error generating access token:');
    throw new Error('Failed to generate access token');
  }
};
