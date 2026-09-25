'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getVisitorIdFromCookie } from '@/app/lib/services/cookies';
import type { ThreadAction } from '../../contracts/thread.types';
import { getPublicProjectQuery } from '@/features/projects/services/queries/get-project-query';

/**
 * Create a thread for a visitor with no session — the public assistant page,
 * or the panel's signed-out fallback.
 *
 * A Server Action, callable by anyone, so nothing it is handed may name the
 * organization. The organization and the project come from the public
 * access token, resolved the same way the
 * guest stream route resolves it; a mentioned project is kept only when it
 * belongs to that organization. Without a token the thread has no
 * organization and mentions nothing.
 */
export const createGuestThreadCommand = async ({
  accessToken,
  mentionedProjectId,
  preferredModel,
}: {
  accessToken?: string;
  initialMessage?: string;
  mentionedProjectId?: string;
  preferredModel?: string;
}): Promise<ThreadAction> => {
  try {
    const visitorId = await getVisitorIdFromCookie();

    const publicProject = accessToken
      ? await getPublicProjectQuery(accessToken)
      : null;
    if (accessToken && !publicProject) {
      return { success: false, errorMessage: 'Cannot create thread' };
    }
    const organizationId = publicProject?.organizationId ?? null;
    const projectId = publicProject?.projectId ?? null;

    const mentioned =
      organizationId && mentionedProjectId
        ? await db.project.findFirst({
            where: { id: mentionedProjectId, organizationId },
            select: { id: true },
          })
        : null;

    const threadRecord = await db.thread.create({
      data: {
        organizationId,
        visitorId: visitorId,
        projectId,
        mentionedProjectId: mentioned?.id ?? null,
        preferredModel: preferredModel,
      },
    });

    // Note: initialMessage is NOT saved here — it's stored in sessionStorage
    // and processed by usePublicAssistantLogic.fetchData which triggers the
    // assistant stream (saving + AI response) to avoid duplicate messages.

    return {
      success: true,
      thread: {
        id: threadRecord.id,
        projectId,
      },
    };
  } catch (error) {
    logger.error({ err: error }, 'Cannot create guest thread');
    return { success: false, errorMessage: 'Cannot create thread' };
  }
};
