'use server';

import { logger } from '@/app/lib/utils/logger';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import {
  ragenApiRequest,
  extractErrorMessage,
} from '@/libs/ragen-api-client/client';
import { UnauthorizedException } from '@/libs/utils/errors';

/**
 * Cut over to apps/api's `POST /v1/internal/projects/:id/toggle-chatbot`
 * (see docs/adrs/21-monorepo-and-api-decoupling.md, Phase C UI cutover) —
 * called directly from `useToggleChatbotEnabled.ts`, not routed through
 * `src/app/actions/index.ts`. `ProjectsService.toggleChatbot` already
 * enforces the same `requireProjectAccess(projectId, 'owner')` +
 * `publicChatbot` feature-flag check this command did locally, throwing
 * `@nestjs/common`'s `UnauthorizedException` (not this file's own
 * `@/libs/utils/errors` one) — `extractErrorMessage` pulls the original
 * "Public chatbot is not enabled..." text back out of the HTTP error
 * body so it can be re-thrown as this project's own exception type,
 * preserving the "surface authorization failures so the UI can show the
 * upgrade prompt" behavior the original comment called out.
 */
export const toggleChatbotCommand = async (
  projectId: string,
  enabled: boolean,
) => {
  const [orgId, userId] = await Promise.all([
    getOrgIdFromAuthOrThrow(),
    getCurrentUserId(),
  ]);
  if (!userId) {
    return { success: false };
  }

  try {
    const result = await ragenApiRequest<{ success: boolean }>({
      method: 'POST',
      path: `/v1/internal/projects/${encodeURIComponent(projectId)}/toggle-chatbot`,
      userId,
      orgId,
      body: { enabled },
    });
    logger.info({ projectId, enabled }, 'Chatbot status updated successfully');
    return result;
  } catch (error) {
    // Surface authorization failures so the UI can show the upgrade prompt
    // instead of a generic "couldn't save" state.
    if (
      error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as { status: number }).status === 403
    ) {
      throw new UnauthorizedException(
        extractErrorMessage(
          error,
          'Public chatbot is not enabled for your organization plan',
        ),
      );
    }
    logger.error({ err: error, projectId }, 'Error updating chatbot status');
    return { success: false };
  }
};
