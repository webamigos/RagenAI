import { type NextRequest, NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';
import { logger } from '@/app/lib/utils/logger';
import { auth } from '@/lib/auth';
import db from '@ragenai/prisma-client';
import { getOrgIdFromAuth } from '@/app/lib/utils/auth-helpers';
import { getEffectiveProjectPermissionQuery } from '@/features/projects/services/queries/get-effective-project-permission-query';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: StatusCodes.UNAUTHORIZED },
      );
    }

    const orgId = await getOrgIdFromAuth();
    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: StatusCodes.FORBIDDEN },
      );
    }

    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: StatusCodes.BAD_REQUEST },
      );
    }

    const effectivePermission = await getEffectiveProjectPermissionQuery(
      projectId,
      orgId,
      session.user.id,
    );

    if (!effectivePermission.canView) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: StatusCodes.NOT_FOUND },
      );
    }

    const project = await db.project.findFirst({
      where: {
        id: projectId,
        organizationId: orgId,
      },
      select: {
        id: true,
        title: true,
        ownerId: true,
        isPublic: true,
        accessToken: true,
        publishedAt: true,
        chatbotEnabled: true,
        isStarred: true,
        isArchived: true,
        templateId: true,
        template: {
          select: { name: true, iconUrl: true },
        },
        threads: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            createdAt: true,
            isStarred: true,
            visitorId: true,
            userId: true,
            source: true,
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: { content: true },
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: StatusCodes.NOT_FOUND },
      );
    }

    // Non-managers only see their own threads under a shared project.
    const visibleThreads = effectivePermission.canManage
      ? project.threads
      : project.threads.filter((t) => t.visitorId === session.user.id);

    return NextResponse.json({
      ...project,
      threads: visibleThreads,
      effectivePermission,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching project');
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: StatusCodes.INTERNAL_SERVER_ERROR },
    );
  }
}
