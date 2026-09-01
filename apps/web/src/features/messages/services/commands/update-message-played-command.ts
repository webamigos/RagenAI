'use server';

import { logger } from '@/app/lib/utils/logger';
import { getCurrentUser, getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';

/**
 * Cut over to apps/api's `POST /v1/internal/messages/:id/played` (see
 * docs/adrs/21-monorepo-and-api-decoupling.md, Phase C UI cutover) —
 * called directly from `useVoiceMode.ts`, not routed through
 * `src/app/actions/index.ts`.
 */
export const updateMessagePlayedCommand = async (messagePublicId: string) => {
  try {
    const [user, orgId] = await Promise.all([
      getCurrentUser(),
      getOrgIdFromAuth(),
    ]);
    if (!orgId || !user) {
      throw new Error('Unauthorized: organization context required');
    }

    return await ragenApiRequest({
      method: 'POST',
      path: `/v1/internal/messages/${encodeURIComponent(messagePublicId)}/played`,
      userId: user.id,
      orgId,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update message played status');
    throw error;
  }
};
