import { type NextRequest, NextResponse } from 'next/server';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUser,
} from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import { getProjectByIdOrThrowQuery as getProjectByIdOrThrow } from '@/features/projects/services/queries/get-project-query';
import { saveOrganizationPublicMetadataCommand as saveOrganizationPublicMetadata } from '@/features/organizations/services/commands/save-organization-metadata-command';
import db from '@ragenai/prisma-client';
import {
  UploadRejectedError,
  uploadFileCommand,
} from '@/features/documents/services/commands/upload-file-command';
import {
  getStorageUsageQuery,
  getProjectStorageUsageQuery,
} from '@/features/organizations/services/queries/get-storage-usage-query';
import { type PiiPolicy } from '@/generated/prisma/client';
import { piiPolicySchema } from './pii-policy-schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// I've removed uploader/organization id from request
// it was security breach - everyone could set any organization during files transfer
export async function POST(request: NextRequest) {
  const orgId = await getOrgIdFromAuthOrThrow();
  if (!orgId) {
    throw new Error('Invalid organization');
  }

  const [user, org] = await Promise.all([
    getCurrentUser(),
    db.organization.findUnique({
      where: { id: orgId },
      select: { slug: true, id: true },
    }),
  ]);

  if (!org) {
    return NextResponse.json(
      { message: 'Organization not found' },
      { status: 404 },
    );
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const formProjectId = formData.get('projectId')?.toString();
    const folderId = formData.get('folderId')?.toString() || null;
    const rawPiiPolicy = formData.get('pii_policy')?.toString() ?? null;
    const piiPolicyResult = piiPolicySchema.safeParse(rawPiiPolicy);
    if (!piiPolicyResult.success) {
      return NextResponse.json(
        {
          message: 'Invalid pii_policy value',
          errors: piiPolicyResult.error.flatten(),
        },
        { status: 400 },
      );
    }
    const piiPolicy = piiPolicyResult.data ?? null;

    if (!files || files.length === 0) {
      return NextResponse.json(
        { message: 'No file to process' },
        { status: 400 },
      );
    }

    let projectRecord = undefined;
    if (formProjectId) {
      try {
        projectRecord = await getProjectByIdOrThrow(formProjectId, orgId);
      } catch {
        return NextResponse.json(
          { message: 'Project does not belong to this organization' },
          { status: 403 },
        );
      }
    }

    // Storage-limit state is maintained as running totals across the
    // multi-file loop so two sub-limit files don't sneak past a shared
    // budget. `uploadFileCommand` also validates but we pre-compute
    // once to avoid N round-trips.
    const [orgUsage, projectUsageResult] = await Promise.all([
      getStorageUsageQuery(orgId),
      projectRecord
        ? getProjectStorageUsageQuery(orgId, projectRecord.id)
        : Promise.resolve(null),
    ]);
    let runningOrgUsage = orgUsage.totalBytes;
    let runningProjectUsage = projectUsageResult?.totalBytes ?? 0;

    const processedFiles = [];
    const failedFiles: { fileName: string; error: string }[] = [];

    for (const file of files) {
      try {
        const { fileRecord, bytesUsed, workflowId } = await uploadFileCommand({
          file,
          organizationId: orgId,
          organizationSlug: org.slug,
          projectId: projectRecord?.id ?? null,
          userId: user?.id ?? null,
          userEmail: user?.email ?? null,
          folderId: folderId || null,
          piiPolicy: piiPolicy as PiiPolicy | null,
          runningUsage: {
            orgBytes: runningOrgUsage,
            projectBytes: runningProjectUsage,
          },
        });

        logger.info(
          { workflowId, fileName: fileRecord.fileName },
          'Upload + workflow complete',
        );

        processedFiles.push({
          fileName: fileRecord.fileName,
          fileSize: bytesUsed,
          uniqueFileId: fileRecord.id,
        });

        runningOrgUsage += bytesUsed;
        if (projectRecord) {
          runningProjectUsage += bytesUsed;
        }
      } catch (error) {
        let message = 'Unknown error';
        if (error instanceof UploadRejectedError) {
          message = error.message;
        } else if (error instanceof Error) {
          message = error.message;
        }
        if (!(error instanceof UploadRejectedError)) {
          logger.error({ err: error }, `Error processing file ${file.name}`);
        }
        failedFiles.push({ fileName: file.name, error: message });
        // Continue processing remaining files
      }
    }

    if (processedFiles.length > 0) {
      await saveOrganizationPublicMetadata(orgId, {
        hasKnowledge: true,
      });
    }

    if (processedFiles.length === 0 && failedFiles.length > 0) {
      return NextResponse.json(
        { message: 'All files failed to process', failedFiles },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message:
        failedFiles.length > 0
          ? `${processedFiles.length} file(s) processed, ${failedFiles.length} failed`
          : 'All files are successfully processed',
      status: 200,
      files: processedFiles,
      failedFiles: failedFiles.length > 0 ? failedFiles : undefined,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error processing files');
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : 'Internal Server Error',
      },
      { status: 500 },
    );
  }
}
