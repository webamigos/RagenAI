import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import {
  setThreadProjectContext,
  type ThreadProjectContextChange,
} from '@/features/threads/services/commands/set-thread-project-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ threadId: string }>;
};

const updateContextSchema = z.object({
  mentionedProjectId: z.string().uuid().nullable(),
});

/** The caller's organization and user, or the response that refuses them. */
async function caller(
  request: NextRequest,
): Promise<{ organizationId: string; userId: string } | Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  const organizationId = await getOrgIdFromAuth();
  if (!organizationId) {
    return new Response('Organization not found', { status: 401 });
  }
  return { organizationId, userId: session.user.id };
}

function respond(change: ThreadProjectContextChange): Response {
  if (change.status === 'thread-not-found') {
    return new Response('Thread not found', { status: 404 });
  }
  if (change.status === 'project-not-found') {
    return new Response('Project not found or access denied', { status: 404 });
  }
  return Response.json({
    success: true,
    mentionedProjectId: change.mentionedProjectId,
  });
}

// PATCH - Point one of the caller's threads at a project they can see
export async function PATCH(request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  try {
    const who = await caller(request);
    if (who instanceof Response) {
      return who;
    }

    const parsed = updateContextSchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response('Invalid request', { status: 400 });
    }

    const change = await setThreadProjectContext({
      threadId,
      ...who,
      mentionedProjectId: parsed.data.mentionedProjectId,
    });
    if (change.status === 'ok') {
      logger.info(
        { threadId, mentionedProjectId: change.mentionedProjectId },
        'Thread project context updated',
      );
    }
    return respond(change);
  } catch (error) {
    logger.error({ err: error }, 'Error updating thread project context');
    return new Response('Internal Server Error', { status: 500 });
  }
}

// DELETE - Remove a thread's project context (back to organization instructions)
export async function DELETE(request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  try {
    const who = await caller(request);
    if (who instanceof Response) {
      return who;
    }

    const change = await setThreadProjectContext({
      threadId,
      ...who,
      mentionedProjectId: null,
    });
    if (change.status === 'ok') {
      logger.info({ threadId }, 'Thread project context removed');
    }
    return respond(change);
  } catch (error) {
    logger.error({ err: error }, 'Error removing thread project context');
    return new Response('Internal Server Error', { status: 500 });
  }
}
