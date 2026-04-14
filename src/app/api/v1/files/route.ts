import { type NextRequest, NextResponse } from 'next/server';
import db from '@ragenai/prisma-client';
import {
  UploadRejectedError,
  uploadFileCommand,
} from '@/features/documents/services/commands/upload-file-command';
import { logger } from '@/app/lib/utils/logger';
import {
  InternalAuthError,
  extractInternalContext,
  recordInternalAuthFailure,
  verifyInternalSecret,
} from '@/app/api/v1/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Internal endpoint consumed by ragen-api's OpenAI-compatible
 * `POST /v1/files` to push an uploaded file through the full ingest
 * pipeline.
 *
 * Pipeline lives in `uploadFileCommand` — shared with the UI's
 * `/api/upload` multi-file route. This route is a thin auth + single-
 * file wrapper.
 */
export async function POST(request: NextRequest) {
  try {
    verifyInternalSecret(request);
    const context = extractInternalContext(request);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'Missing file in multipart body', code: 400 },
        { status: 400 },
      );
    }

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

    const organization = await db.organization.findUnique({
      where: { id: project.organizationId },
      select: { slug: true },
    });
    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found', code: 404 },
        { status: 404 },
      );
    }

    try {
      const { fileRecord, workflowId } = await uploadFileCommand({
        file,
        organizationId: project.organizationId,
        organizationSlug: organization.slug,
        projectId: project.id,
        userId: context.userId,
      });

      return NextResponse.json({ file: fileRecord, workflowId });
    } catch (err) {
      if (err instanceof UploadRejectedError) {
        const status =
          err.reason === 's3_upload_failed' ||
          err.reason === 'workflow_start_failed'
            ? 502
            : 413;
        return NextResponse.json(
          { error: err.message, code: status, reason: err.reason },
          { status },
        );
      }
      throw err;
    }
  } catch (error) {
    if (error instanceof InternalAuthError) {
      recordInternalAuthFailure(request, '/api/v1/files', error.message);
      return NextResponse.json(
        { error: 'Unauthorized', code: 401 },
        { status: 401 },
      );
    }
    logger.error({ err: error }, 'Error in POST /api/v1/files');
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        code: 500,
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
