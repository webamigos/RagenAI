import { type NextRequest, NextResponse } from 'next/server';
import db from '@ragenai/prisma-client';
import { deleteFileCommand } from '@/features/documents/services/commands/delete-file-command';
import { logger } from '@/app/lib/utils/logger';
import {
  InternalAuthError,
  extractStrictInternalContext,
  recordInternalAuthFailure,
  verifyInternalSecret,
} from '@/app/api/v1/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Internal endpoint consumed by ragen-api's OpenAI-compatible
 * `DELETE /v1/files/:id`. Scoped to the caller's project. Cleanup
 * (DB + S3 + vectors + UserDocument) is handled by `deleteFileCommand`
 * — shared with the UI's `deleteFileAction` / `deleteProjectFileAction`
 * and the folder-delete cascade.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    verifyInternalSecret(request);
    const context = extractStrictInternalContext(request);
    const { fileId } = await params;

    // Resolve org from the project so we don't need an extra header.
    const project = await db.project.findUnique({
      where: { id: context.projectId },
      select: { id: true, organizationId: true },
    });
    if (!project?.organizationId) {
      return NextResponse.json(
        { error: 'Project not found', code: 404 },
        { status: 404 },
      );
    }

    const result = await deleteFileCommand({
      fileId,
      organizationId: project.organizationId,
      projectId: project.id,
    });

    if (!result.deleted) {
      return NextResponse.json(
        { error: 'File not found', code: 404 },
        { status: 404 },
      );
    }

    return NextResponse.json({ id: result.fileId, deleted: true });
  } catch (error) {
    if (error instanceof InternalAuthError) {
      recordInternalAuthFailure(
        request,
        '/api/v1/files/[fileId]',
        error.message,
      );
      return NextResponse.json(
        { error: 'Unauthorized', code: 401 },
        { status: 401 },
      );
    }
    logger.error({ err: error }, 'Error in DELETE /api/v1/files/[fileId]');
    return new Response('Internal Server Error', { status: 500 });
  }
}
