import { type NextRequest, NextResponse } from 'next/server';
import { getFileFromS3 } from '@/app/lib/services/storage';
import db from '@ragenai/prisma-client';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';

export const dynamic = 'force-dynamic';

const SAFE_INLINE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

function sanitizeFilename(filename: string): string {
  return filename.replace(/["\r\n\\;]/g, '_');
}

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
        id: true,
        fileExtension: true,
        fileMimeType: true,
        fileName: true,
      },
    });

    if (!file || !file.fileExtension) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const s3Key = `${file.id}.${file.fileExtension}`;
    const buffer = await getFileFromS3(s3Key);
    const disposition = SAFE_INLINE_TYPES.has(file.fileMimeType ?? '')
      ? 'inline'
      : 'attachment';
    const asciiName = sanitizeFilename(file.fileName).replace(
      /[^\x20-\x7E]/g,
      '_',
    );
    const utf8Name = encodeURIComponent(file.fileName);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': file.fileMimeType || 'application/octet-stream',
        'Content-Disposition': `${disposition}; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    logger.error({ err: error, fileId }, 'Failed to serve file');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
