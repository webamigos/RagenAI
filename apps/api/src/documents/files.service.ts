import { Injectable, Logger } from '@nestjs/common';
import type { OrgVisibilityScope } from '@ragenai/platform-contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import {
  type FileType,
  type EmbeddingStatus,
  type PiiPolicy,
  type Prisma,
} from '../generated/prisma/client.js';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
  decryptThreadKey,
} from '@ragenai/crypto';
import { decryptDocumentContent } from '@ragenai/crypto';
import type {
  CreateMarkdownDocumentInput,
  UserFilesSort,
  UserFilesSortDir,
  PaginatedUserFilesResult,
} from './types.js';

export type FileViewMode = 'all' | 'my-files' | 'shared-with-me';
type OperationResult = { success: true } | { success: false; error: string };

const DEFAULT_PAGE_SIZE = 25;

/**
 * Ported from apps/web's src/features/documents/services/{commands,queries}
 * (file metadata subset — not upload/storage). See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * `getOrgIdFromAuthOrThrow()`/`getOrgIdFromAuthOrThrow` (apps/web's
 * session-cookie auth helpers) replaced with an explicit `orgId` parameter
 * on every method that needed them. `trackAudit()` replaced with the
 * injected `AuditLogService`; `getProjectByIdOrThrowQuery()` replaced with
 * the injected `ProjectsService.getProjectByIdOrThrow()`.
 *
 * Not ported (needs S3 and/or Temporal, neither of which exists in
 * apps/api yet): delete-file-command.ts, delete-folder-command.ts,
 * reembed-file-command.ts, reembed-folder-with-policy-command.ts,
 * score-file-command.ts, upload-file-command.ts, rag-optimizer/*,
 * utils/file-parser.ts.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly projects: ProjectsService,
  ) {}

  async createFile(
    fileName: string,
    fileSize: number,
    organizationId: string,
    fileType: FileType,
    projectId: string | null,
    options?: {
      folderId?: string | null;
      ownerId?: string | null;
      fileExtension?: string | null;
      fileMimeType?: string | null;
      piiPolicy?: PiiPolicy | null;
    },
  ) {
    const file = await this.prisma.client.userFile.create({
      data: {
        organizationId,
        fileName,
        fileSize,
        fileType,
        projectId,
        folderId: options?.folderId ?? null,
        ownerId: options?.ownerId ?? null,
        fileExtension: options?.fileExtension ?? null,
        fileMimeType: options?.fileMimeType ?? null,
        ...(options?.piiPolicy ? { piiPolicy: options.piiPolicy } : {}),
      },
    });

    this.auditLog.track({
      orgId: organizationId,
      action: 'document.uploaded',
      entityType: 'document',
      entityId: file.id,
      newData: { fileName, fileSize, fileType },
    });

    return file;
  }

  async createDocument({
    title,
    content,
    organizationId,
    fileId,
    projectId,
  }: CreateMarkdownDocumentInput) {
    let encryptedContent = content;
    let encryptedDek: string | null = null;

    if (isEncryptionEnabled()) {
      const key = await generateThreadKey();
      encryptedContent = encryptContent(content, key.plaintextDek);
      encryptedDek = key.encryptedDek;
    }

    // The document's owner mirrors the file's, so the document keeps its
    // standing when the file is deleted (`file_id` is ON DELETE SET NULL). With
    // no file there is nothing to mirror and `ownerId` stays null, which means
    // org-wide — unchanged for documents authored in the app.
    const file = fileId
      ? await this.prisma.client.userFile.findFirst({
          where: { id: fileId, organizationId },
          select: { ownerId: true },
        })
      : null;

    return this.prisma.client.userDocument.create({
      data: {
        title,
        content: encryptedContent,
        encryptedDek,
        organizationId,
        fileId,
        projectId,
        ownerId: file?.ownerId ?? null,
      },
    });
  }

  async updateDocumentTitle({
    orgId,
    documentId,
    title,
  }: {
    orgId: string;
    documentId: string;
    title?: string;
  }) {
    await this.prisma.client.userDocument.updateMany({
      where: { organizationId: orgId, id: documentId },
      data: { title, updatedAt: new Date() },
    });
  }

  async updateDocumentContent({
    orgId,
    documentId,
    content,
  }: {
    orgId: string;
    documentId: string;
    content?: string;
  }) {
    if (!content) {
      await this.prisma.client.userDocument.updateMany({
        where: { organizationId: orgId, id: documentId },
        data: { content, encryptedDek: null, updatedAt: new Date() },
      });
      return;
    }

    let encryptedContent = content;
    let encryptedDek: string | undefined;

    if (isEncryptionEnabled()) {
      const existing = await this.prisma.client.userDocument.findFirst({
        where: { organizationId: orgId, id: documentId },
        select: { encryptedDek: true },
      });

      let dek: Buffer;
      if (existing?.encryptedDek) {
        dek = await decryptThreadKey(existing.encryptedDek);
      } else {
        const key = await generateThreadKey();
        dek = key.plaintextDek;
        encryptedDek = key.encryptedDek;
      }

      encryptedContent = encryptContent(content, dek);
    }

    await this.prisma.client.userDocument.updateMany({
      where: { organizationId: orgId, id: documentId },
      data: {
        content: encryptedContent,
        ...(encryptedDek ? { encryptedDek } : {}),
        updatedAt: new Date(),
      },
    });
  }

  async deleteDocumentFromDb(documentId: string, orgId: string) {
    return this.prisma.client.userDocument.deleteMany({
      where: { id: documentId, organizationId: orgId },
    });
  }

  async deleteFileFromDb(fileId: string, orgId: string) {
    const result = await this.prisma.client.userFile.deleteMany({
      where: { id: fileId, organizationId: orgId },
    });

    this.auditLog.track({
      orgId,
      action: 'document.deleted',
      entityType: 'document',
      entityId: fileId,
    });

    return result;
  }

  async deleteProjectFileFromDb(
    fileId: string,
    projectId: string,
    orgId: string,
  ) {
    return this.prisma.client.userFile.deleteMany({
      where: { id: fileId, organizationId: orgId, projectId },
    });
  }

  async moveFileToFolder(
    fileId: string,
    folderId: string | null,
    organizationId: string,
  ): Promise<OperationResult> {
    const file = await this.prisma.client.userFile.findFirst({
      where: { id: fileId, organizationId },
      select: { id: true },
    });

    if (!file) {
      return { success: false, error: 'File not found' };
    }

    if (folderId) {
      const folder = await this.prisma.client.documentFolder.findFirst({
        where: { id: folderId, organizationId },
      });
      if (!folder) {
        return { success: false, error: 'Folder not found' };
      }
    }

    await this.prisma.client.userFile.update({
      where: { id: file.id },
      data: { folderId },
    });

    return { success: true };
  }

  /**
   * Imports a file from the global knowledge base into a project. Creates
   * a lightweight UserFile record that references the source file via
   * `sourceFileId`. No re-embedding is needed — the RAG chain uses an OR
   * filter to include the source file's existing vector-store embeddings.
   */
  async importFileToProject(
    sourceFileId: string,
    targetProjectId: string,
    orgId: string,
  ) {
    const targetProject =
      await this.projects.getProjectByIdOrThrow(targetProjectId);

    if (targetProject.organizationId !== orgId) {
      throw new Error(
        'Cannot import file to a project in another organization',
      );
    }

    const sourceFile = await this.prisma.client.userFile.findFirst({
      where: { id: sourceFileId, organizationId: orgId },
    });

    if (!sourceFile) {
      throw new Error('Source file not found');
    }

    const existingFile = await this.prisma.client.userFile.findFirst({
      where: {
        organizationId: orgId,
        projectId: targetProject.id,
        OR: [
          { sourceFileId: sourceFile.id },
          { fileName: sourceFile.fileName },
        ],
      },
    });

    if (existingFile) {
      return { alreadyExists: true, file: existingFile };
    }

    const newFile = await this.prisma.client.userFile.create({
      data: {
        organizationId: orgId,
        fileName: sourceFile.fileName,
        fileSize: sourceFile.fileSize,
        fileType: sourceFile.fileType,
        metadata: sourceFile.metadata ?? {},
        projectId: targetProject.id,
        isUploaded: sourceFile.isUploaded,
        uploadedAt: sourceFile.uploadedAt,
        isBinaryFile: sourceFile.isBinaryFile,
        fileExtension: sourceFile.fileExtension,
        fileMimeType: sourceFile.fileMimeType,
        sourceFileId: sourceFile.id,
        // A copy carries the standing of what it was copied from. Leaving
        // these unset would default the copy to `ownerId: null,
        // isOrgWide: false` — owned by nobody and shared with nobody, which
        // is narrower than the source and reachable only at org scope.
        ownerId: sourceFile.ownerId,
        isOrgWide: sourceFile.isOrgWide,
        parsingStatus: sourceFile.parsingStatus,
        embeddingStatus: sourceFile.embeddingStatus,
        parsingCompletedAt: sourceFile.parsingCompletedAt,
        embeddingCompletedAt: sourceFile.embeddingCompletedAt,
      },
    });

    this.logger.log(
      `File imported to project from knowledge base (sourceFileId=${sourceFile.id}, newFileId=${newFile.id}, targetProjectId=${targetProject.id})`,
    );

    return { alreadyExists: false, file: newFile };
  }

  async getFileDetailsById(fileId: string, orgId: string) {
    return this.prisma.client.userFile.findFirst({
      where: { organizationId: orgId, id: fileId },
    });
  }

  async getOrganizationFilesCount(organizationId: string): Promise<number> {
    return this.prisma.client.userFile.count({
      where: { organizationId },
    });
  }

  async getProjectFiles(projectId: string, orgId: string) {
    return this.prisma.client.userFile.findMany({
      where: { organizationId: orgId, projectId },
      select: {
        id: true,
        createdAt: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        updatedAt: true,
        metadata: true,
        organizationId: true,
        parsingStatus: true,
        embeddingStatus: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserFiles(
    organizationId: string,
    userTeamIds: string[] = [],
    options?: {
      userId?: string;
      scope?: OrgVisibilityScope;
      folderId?: string | null;
      viewMode?: FileViewMode;
      sort?: UserFilesSort;
      dir?: UserFilesSortDir;
      page?: number;
      pageSize?: number;
      fileType?: FileType[];
      embeddingStatus?: EmbeddingStatus[];
    },
  ): Promise<PaginatedUserFilesResult> {
    const {
      userId,
      scope = 'member',
      folderId,
      viewMode = 'all',
      sort = 'createdAt',
      dir = 'desc',
      page = 1,
      pageSize = DEFAULT_PAGE_SIZE,
      fileType = [],
      embeddingStatus = [],
    } = options ?? {};

    const baseWhere: Record<string, unknown> = { organizationId };

    if (folderId !== undefined) {
      baseWhere.folderId = folderId;
    }

    if (fileType.length > 0) {
      baseWhere.fileType = { in: fileType };
    }

    if (embeddingStatus.length > 0) {
      baseWhere.embeddingStatus = { in: embeddingStatus };
    }

    if (viewMode === 'my-files') {
      baseWhere.ownerId = userId;
    } else if (viewMode === 'shared-with-me') {
      baseWhere.ownerId = { not: null, notIn: userId ? [userId] : [] };

      const permissionConditions = [
        {
          permissions: {
            some: { granteeType: 'user', granteeId: userId },
          },
        },
        ...(userTeamIds.length > 0
          ? [
              {
                permissions: {
                  some: {
                    granteeType: 'team',
                    granteeId: { in: userTeamIds },
                  },
                },
              },
            ]
          : []),
        {
          folder: {
            permissions: {
              some: { granteeType: 'user', granteeId: userId },
            },
          },
        },
        ...(userTeamIds.length > 0
          ? [
              {
                folder: {
                  permissions: {
                    some: {
                      granteeType: 'team',
                      granteeId: { in: userTeamIds },
                    },
                  },
                },
              },
            ]
          : []),
      ];

      baseWhere.OR = permissionConditions;
    } else if (scope === 'none') {
      // Mirrors apps/web's get-user-files-query.ts: a non-member reaches
      // nothing, in any view mode.
      baseWhere.id = { in: [] };
    } else if (scope !== 'organization') {
      baseWhere.OR = [
        // Shared with the organization, stated rather than inferred from a
        // null owner — which a deleted user would also produce.
        { isOrgWide: true },
        { ownerId: userId },
        ...(userTeamIds.length > 0
          ? [{ folder: { teamId: { in: userTeamIds } } }]
          : []),
        {
          permissions: {
            some: {
              resourceType: 'file',
              granteeType: 'user',
              granteeId: userId,
            },
          },
        },
        ...(userTeamIds.length > 0
          ? [
              {
                permissions: {
                  some: {
                    resourceType: 'file',
                    granteeType: 'team',
                    granteeId: { in: userTeamIds },
                  },
                },
              },
            ]
          : []),
      ];
    }

    const skip = (page - 1) * pageSize;

    const [totalCount, items] = await Promise.all([
      this.prisma.client.userFile.count({ where: baseWhere }),
      this.prisma.client.userFile.findMany({
        where: baseWhere,
        select: {
          createdAt: true,
          fileName: true,
          fileSize: true,
          fileType: true,
          updatedAt: true,
          metadata: true,
          organizationId: true,
          id: true,
          projectId: true,
          folderId: true,
          ownerId: true,
          embeddingStatus: true,
          embeddingCompletedAt: true,
          embeddingFailedAt: true,
          embeddingStartedAt: true,
          parsingStatus: true,
          thumbnailS3Key: true,
          piiPolicy: true,
          document: { select: { id: true } },
          project: { select: { title: true, id: true } },
          folder: { select: { id: true, name: true, teamId: true } },
          owner: { select: { name: true } },
        },
        orderBy: { [sort]: dir },
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    return { items, totalCount, totalPages, page, pageSize };
  }

  async getAllOrgFiles(
    organizationId: string,
    userTeamIds: string[] = [],
    options?: {
      userId?: string;
      scope?: OrgVisibilityScope;
    },
  ) {
    const { userId, scope = 'member' } = options ?? {};

    // Assigned in branches rather than a nested ternary, which this repo's
    // ESLint config forbids — and which reads badly for three cases anyway.
    let accessFilter: Prisma.UserFileWhereInput;
    if (scope === 'none') {
      // A non-member reaches nothing, not even the org-wide files the member
      // branch admits.
      accessFilter = { id: { in: [] } };
    } else if (scope === 'organization') {
      accessFilter = {};
    } else {
      accessFilter = {
        OR: [
          { isOrgWide: true },
          ...(userId ? [{ ownerId: userId }] : []),
          ...(userTeamIds.length > 0
            ? [{ folder: { teamId: { in: userTeamIds } } }]
            : []),
          ...(userId
            ? [
                {
                  permissions: {
                    some: {
                      granteeType: 'user',
                      granteeId: userId,
                    },
                  },
                },
              ]
            : []),
          ...(userTeamIds.length > 0
            ? [
                {
                  permissions: {
                    some: {
                      granteeType: 'team',
                      granteeId: { in: userTeamIds },
                    },
                  },
                },
              ]
            : []),
        ],
      };
    }

    return this.prisma.client.userFile.findMany({
      where: {
        organizationId,
        embeddingStatus: 'COMPLETED',
        ...accessFilter,
      },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        fileType: true,
        createdAt: true,
        folderId: true,
        ownerId: true,
        piiPolicy: true,
        project: { select: { id: true, title: true } },
        folder: { select: { id: true, name: true, teamId: true } },
        owner: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentById(documentId: string, orgId: string) {
    const doc = await this.prisma.client.userDocument.findFirst({
      where: { organizationId: orgId, id: documentId },
    });

    if (!doc) {
      return null;
    }

    const { encryptedDek, ...rest } = doc;
    return {
      ...rest,
      content: await decryptDocumentContent(doc.content, encryptedDek),
    };
  }

  async getDocumentByIdWithFile(documentId: string, orgId: string) {
    const doc = await this.prisma.client.userDocument.findFirst({
      where: { organizationId: orgId, id: documentId },
      include: { file: true },
    });

    if (!doc) {
      return null;
    }

    const { encryptedDek, ...rest } = doc;
    return {
      ...rest,
      content: await decryptDocumentContent(doc.content, encryptedDek),
    };
  }

  async getDocumentPreview({
    orgId,
    documentId,
  }: {
    orgId: string;
    documentId: string;
  }) {
    const docs = await this.prisma.client.userDocument.findMany({
      where: { organizationId: orgId, id: documentId },
      select: {
        content: true,
        encryptedDek: true,
        title: true,
        file: {
          select: { id: true, fileType: true, fileExtension: true },
        },
      },
    });

    return Promise.all(
      docs.map(async ({ encryptedDek, ...rest }) => ({
        ...rest,
        content: await decryptDocumentContent(rest.content, encryptedDek),
      })),
    );
  }
}
