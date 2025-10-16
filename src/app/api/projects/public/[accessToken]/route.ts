import { NextRequest, NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';
import { logger } from '@/app/lib/utils/logger';
import { getPublicProject } from '@/app/lib/services/project';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accessToken: string }> }
) {
  try {
    const { accessToken } = await params;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Access token is required' },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    const project = await getPublicProject(accessToken);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found or not public' },
        { status: StatusCodes.NOT_FOUND }
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
