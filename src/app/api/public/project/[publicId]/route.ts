import { type NextRequest, NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> },
) {
  try {
    const { publicId } = await params;

    // Find project by accessToken (public identifier)
    const project = await db.project.findFirst({
      where: {
        accessToken: publicId,
      },
      select: {
        publicId: true,
        title: true,
        isPublic: true,
      },
    });
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: StatusCodes.NOT_FOUND },
      );
    }

    // Check if project is public
    if (!project.isPublic) {
      return NextResponse.json(
        { error: 'Project is not public' },
        { status: StatusCodes.FORBIDDEN },
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching public project');
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: StatusCodes.INTERNAL_SERVER_ERROR },
    );
  }
}
