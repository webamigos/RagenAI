import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { FilesService } from './files.service.js';
import { DeleteFileFromVectorStoreService } from './delete-file-from-vector-store.service.js';
import { S3StorageService } from '../storage/s3-storage.service.js';
import { getFileExtension } from './utils/file-type.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';

export type DeleteFileParams = {
  fileId: string;
  organizationId: string;
  /**
   * When provided, enforces project-scoped deletion — the file must
   * belong to this project, or the delete no-ops with `deleted: false`.
   * Omit for org-wide deletes.
   */
  projectId?: string | null;
};

export type DeleteFileResult = {
  deleted: boolean;
  fileId: string;
  fileName: string | null;
};

/**
 * Ported from apps/web's
 * src/features/documents/services/commands/delete-file-command.ts
 * (`deleteFileCommand`). See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Full cleanup for a file: DB row + S3 object + S3 thumbnail + any
 * attached `UserDocument` + vector store entries. External cleanup (S3,
 * vectors, UserDocument) is best-effort — if any step fails we log and
 * keep going so a partial failure doesn't leave the DB row orphaned. The
 * DB delete is the atomic operation that matters for consistency.
 *
 * Deviation: reuses `FilesService.deleteFileFromDb()`/
 * `deleteDocumentFromDb()` (already ported in the earlier `documents`
 * Phase C slice) instead of duplicating the delete + audit-track calls.
 * The `UserDocument` cleanup skips the original's redundant
 * fetch-before-delete — `deleteMany` already no-ops safely when there's
 * nothing to delete.
 */
@Injectable()
export class DeleteFileService {
  private readonly logger = new Logger(DeleteFileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly deleteFromVectorStore: DeleteFileFromVectorStoreService,
    private readonly s3: S3StorageService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async deleteFile(params: DeleteFileParams): Promise<DeleteFileResult> {
    const { fileId, organizationId, projectId } = params;

    // Covers the public `DELETE /v1/files/:id` as well as the internal
    // callers — see the note in UploadFileService about why apps/web's gate
    // does not reach here.
    if (
      !(await this.subscriptions.isFeatureEnabled(
        organizationId,
        'manageDocuments',
      ))
    ) {
      throw new UnauthorizedException(
        'This organization cannot add or remove documents',
      );
    }

    const fileRecord = await this.prisma.client.userFile.findFirst({
      where: {
        id: fileId,
        organizationId,
        ...(projectId !== undefined ? { projectId } : {}),
      },
    });

    if (!fileRecord) {
      return { deleted: false, fileId, fileName: null };
    }

    const { count } = await this.filesService.deleteFileFromDb(
      fileRecord.id,
      organizationId,
    );

    if (count === 0) {
      return { deleted: false, fileId, fileName: fileRecord.fileName };
    }

    const s3Key = `${fileRecord.id}.${getFileExtension(fileRecord.fileName)}`;
    try {
      await this.s3.delete(`${organizationId}/${s3Key}`);
    } catch (err) {
      this.logger.warn('Failed to remove S3 object', { err, s3Key });
    }

    if (fileRecord.thumbnailS3Key) {
      try {
        await this.s3.delete(fileRecord.thumbnailS3Key);
      } catch {
        // Thumbnail cleanup is non-critical.
      }
    }

    if (fileRecord.documentId) {
      try {
        await this.filesService.deleteDocumentFromDb(
          fileRecord.documentId,
          organizationId,
        );
      } catch (err) {
        this.logger.warn('Failed to remove UserDocument', {
          err,
          fileId: fileRecord.id,
        });
      }
    }

    try {
      await this.deleteFromVectorStore.delete(fileRecord.id, organizationId);
    } catch (err) {
      this.logger.warn('Failed to remove vectors', {
        err,
        fileId: fileRecord.id,
      });
    }

    return {
      deleted: true,
      fileId: fileRecord.id,
      fileName: fileRecord.fileName,
    };
  }
}
