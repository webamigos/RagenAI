import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { logger } from '@/app/lib/utils/logger';
import { updateThreadProjectContextCommand as updateThreadProjectContext } from '@/features/threads/services/commands/update-thread-context-command';
import { removeThreadProjectContextCommand as removeThreadProjectContext } from '@/features/threads/services/commands/remove-thread-context-command';
import db from '@ragenai/prisma-client';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ threadId: string }>;
};

const updateContextSchema = z.object({
  mentionedProjectId: z.string().nullable(),
});

// PATCH - Update thread project context
export async function PATCH(request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const orgId = await getOrgIdFromAuth();
    if (!orgId) {
      return new Response('Organization not found', { status: 401 });
    }

    const body = await request.json();
    const { mentionedProjectId } = updateContextSchema.parse(body);

    // Verify thread belongs to user's organization
    const thread = await db.thread.findFirst({
      where: {
        id: threadId,
        organizationId: orgId,
      },
    });

    if (!thread) {
      return new Response('Thread not found', { status: 404 });
    }

    // If mentionedProjectId is provided, verify user has access to the project
    if (mentionedProjectId) {
      const project = await db.project.findFirst({
        where: {
          id: mentionedProjectId,
          organizationId: orgId,
        },
      });

      if (!project) {
        return new Response('Project not found or access denied', {
          status: 404,
        });
      }
    }

    const updatedThread = await updateThreadProjectContext(
      threadId,
      mentionedProjectId,
    );

    logger.info(
      {
        threadId,
        mentionedProjectId,
        orgId,
      },
      'Thread project context updated',
    );

    return Response.json({
      success: true,
      mentionedProjectId: updatedThread.mentionedProjectId,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating thread project context');
    return new Response('Internal Server Error', { status: 500 });
  }
}

// DELETE - Remove thread project context (fallback to organization instructions)
export async function DELETE(request: NextRequest, { params }: Params) {
  const { threadId } = await params;
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const orgId = await getOrgIdFromAuth();
    if (!orgId) {
      return new Response('Organization not found', { status: 401 });
    }

    // Verify thread belongs to user's organization
    const thread = await db.thread.findFirst({
      where: {
        id: threadId,
        organizationId: orgId,
      },
    });

    if (!thread) {
      return new Response('Thread not found', { status: 404 });
    }

    await removeThreadProjectContext(threadId);

    logger.info(
      {
        threadId,
        orgId,
      },
      'Thread project context removed',
    );

    return Response.json({
      success: true,
      mentionedProjectId: null,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error removing thread project context');
    return new Response('Internal Server Error', { status: 500 });
  }
}
