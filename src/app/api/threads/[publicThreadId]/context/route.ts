import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuth } from '@clerk/nextjs/server';
import { logger } from '@/app/lib/utils/logger';
import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import {
  updateThreadProjectContext,
  removeThreadProjectContext,
} from '@/app/lib/services/thread';
import db from '@ragenai/prisma-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ publicThreadId: string }>;
};

const updateContextSchema = z.object({
  mentionedProjectId: z.number().nullable(),
});

// PATCH - Update thread project context
export async function PATCH(request: NextRequest, { params }: Params) {
  const { publicThreadId } = await params;
  try {
    const { orgId, userId } = getAuth(request);
    setSentryServiceTag('thread-context');

    if (!orgId) {
      return new Response('Unauthorized', { status: 401 });
    }

    setSentryClerkOrganizationTag(orgId);

    const body = await request.json();
    const { mentionedProjectId } = updateContextSchema.parse(body);

    // Verify thread belongs to user's organization
    const thread = await db.thread.findFirst({
      where: {
        public_id: publicThreadId,
        organization_id: orgId,
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
          organization_id: orgId,
        },
      });

      if (!project) {
        return new Response('Project not found or access denied', {
          status: 404,
        });
      }
    }

    const updatedThread = await updateThreadProjectContext(
      publicThreadId,
      mentionedProjectId
    );

    logger.info(
      {
        threadId: publicThreadId,
        mentionedProjectId,
        orgId,
      },
      'Thread project context updated'
    );

    return Response.json({
      success: true,
      mentionedProjectId: updatedThread.mentioned_project_id,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating thread project context');
    return new Response('Internal Server Error', { status: 500 });
  }
}

// DELETE - Remove thread project context (fallback to organization instructions)
export async function DELETE(request: NextRequest, { params }: Params) {
  const { publicThreadId } = await params;
  try {
    const { orgId, userId } = getAuth(request);
    setSentryServiceTag('thread-context');

    if (!orgId) {
      return new Response('Unauthorized', { status: 401 });
    }

    setSentryClerkOrganizationTag(orgId);

    // Verify thread belongs to user's organization
    const thread = await db.thread.findFirst({
      where: {
        public_id: publicThreadId,
        organization_id: orgId,
      },
    });

    if (!thread) {
      return new Response('Thread not found', { status: 404 });
    }

    await removeThreadProjectContext(publicThreadId);

    logger.info(
      {
        threadId: publicThreadId,
        orgId,
      },
      'Thread project context removed'
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
