import { type NextRequest, NextResponse } from 'next/server';
import { getFileFromS3ByKey } from '@/app/lib/services/storage';
import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;

  let orgId: string;
  try {
    orgId = await getOrgIdFromAuthOrThrow();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const file = await db.userFile.findFirst({
      where: {
        id: fileId,
        organizationId: orgId,
      },
      select: {
        thumbnailS3Key: true,
      },
    });

    if (!file?.thumbnailS3Key) {
      return NextResponse.json(
        { error: 'Thumbnail not found' },
        { status: 404 },
      );
    }

    const buffer = await getFileFromS3ByKey(file.thumbnailS3Key);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (error) {
    logger.error({ err: error, fileId }, 'Failed to serve thumbnail');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
