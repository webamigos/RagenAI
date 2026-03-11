import { type NextRequest, NextResponse } from 'next/server';
import { getFileFromS3 } from '@/app/lib/services/aws';
import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

function sanitizeFilename(filename: string): string {
  return filename.replace(/["\r\n\\]/g, '_');
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filePublicId: string }> },
) {
  const { filePublicId } = await params;

  let orgId: string;
  try {
    orgId = await getOrgIdFromAuthOrThrow();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const file = await db.userFile.findFirst({
      where: {
        public_id: filePublicId,
        organization_id: orgId,
      },
      select: {
        public_id: true,
        file_extension: true,
        file_mime_type: true,
        file_name: true,
      },
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const s3Key = `${file.public_id}.${file.file_extension}`;
    const buffer = await getFileFromS3(s3Key);
    const safeName = sanitizeFilename(file.file_name);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': file.file_mime_type || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    logger.error({ err: error, filePublicId }, 'Failed to serve file');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
