import { NextRequest, NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ publicId: string }> }
) {
  try {
    const { publicId } = await params;
    logger.info('Request params:', { params, url: request.url });

    // Find project by public_id
    const project = await db.project.findFirst({
      where: {
        access_token: publicId,
      },
      select: {
        id: true,
        public_id: true,
        title: true,
        is_public: true,
        organization_id: true,
      },
    });
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: StatusCodes.NOT_FOUND }
      );
    }

    // Check if project is public
    if (!project.is_public) {
      return NextResponse.json(
        { error: 'Project is not public' },
        { status: StatusCodes.FORBIDDEN }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching public project');
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
