import { NextRequest, NextResponse } from 'next/server';
import { getProjectByPublicId } from '@/app/lib/services/project';
import { StatusCodes } from 'http-status-codes';
import { logger } from '@/app/lib/utils/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const projectId = params.projectId;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: StatusCodes.BAD_REQUEST }
      );
    }

    const project = await getProjectByPublicId(projectId);

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: StatusCodes.NOT_FOUND }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching project');
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: StatusCodes.INTERNAL_SERVER_ERROR }
    );
  }
}
