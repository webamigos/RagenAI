import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FilesService } from './files.service.js';
import { FoldersService } from './folders.service.js';
import { DocumentPermissionsService } from './document-permissions.service.js';
import { GetUserFilesDto } from './dto/get-user-files.dto.js';
import { MoveFileDto } from './dto/move-file.dto.js';
import { ImportFileToProjectDto } from './dto/import-file-to-project.dto.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { UpdateDocumentTitleDto } from './dto/update-document-title.dto.js';
import { UpdateDocumentContentDto } from './dto/update-document-content.dto.js';
import { ShareResourceDto } from './dto/share-resource.dto.js';
import { GetSessionAuthContext } from '../common/decorators/session-auth-context.decorator.js';
import { type SessionAuthContext } from '../common/types/session-auth-context.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';

/**
 * `folderId` arrives as a query string, where the literal `'null'` is how a
 * caller asks for the root folder — distinct from omitting the parameter,
 * which means "no folder filter at all".
 */
function parseFolderId(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value === 'null' ? null : value;
}

/**
 * Session-authenticated, server-to-server routes for the Knowledge Base
 * UI's file/document/permission surface — see `NotificationsController`'s
 * class-level comment for the shared conventions (guard, Swagger
 * exclusion, response-transform skip).
 *
 * Note: `apps/api/src/documents/files.service.ts`'s `FilesService` (this
 * controller) and `apps/api/src/files/files.service.ts`'s `FilesService`
 * (the public OpenAI-compatible `/v1/files` API) are two distinct
 * classes with the same name — don't conflate them.
 *
 * Not exposed here:
 * - `createFile` (raw `UserFile` row creation with no S3 upload — an
 *   internal building block for `upload-file.service.ts`'s
 *   `UploadFileService`, which is what actually backs uploads; not a
 *   standalone UI action).
 * - `deleteFileFromDb`/`deleteDocumentFromDb`/`deleteProjectFileFromDb`
 *   (raw DB-only deletes with no S3/vector cleanup — the public
 *   `/v1/files` `DELETE` route, backed by `DeleteFileService`, is the
 *   real delete-a-file entry point; wiring a second, S3/vector-orphaning
 *   delete route here would be a real correctness hazard, not just
 *   redundant).
 * - `getFileDetailsById`/`getOrganizationFilesCount`/`getDocumentByIdWithFile`
 *   (no corresponding apps/web UI action calls these directly — internal
 *   helpers used by other commands/queries).
 * - `VectorPermissionsService` entirely (`computeAccessibleBy`,
 *   `syncFolderVectorPermissions`) — grepping apps/web's `src/app/`
 *   confirms neither is ever called from a UI action; the source file's
 *   own doc comment describes `syncFolderVectorPermissions` as something
 *   to "call after folder permission changes" (i.e. server-side
 *   orchestration, not a user-triggered action) and a standalone backfill
 *   script (`src/scripts/backfill-accessible-by.ts`). Nothing to wire.
 */
@ApiExcludeController()
@Controller('internal')
@UseGuards(SessionAuthGuard)
@SkipResponseTransform()
export class DocumentsController {
  constructor(
    private readonly files: FilesService,
    private readonly folders: FoldersService,
    private readonly permissions: DocumentPermissionsService,
  ) {}

  // --- Files --------------------------------------------------------

  @Get('files')
  async listFiles(
    @Query() query: GetUserFilesDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    const { isOrgAdmin, userTeamIds } = await this.folders.getMembershipContext(
      context.orgId,
      context.userId,
    );
    return this.files.getUserFiles(context.orgId, userTeamIds, {
      userId: context.userId,
      isOrgAdmin,
      folderId: parseFolderId(query.folderId),
      viewMode: query.viewMode,
      sort: query.sort,
      dir: query.dir,
      page: query.page,
      pageSize: query.pageSize,
      fileType: query.fileType,
      embeddingStatus: query.embeddingStatus,
    });
  }

  @Get('files/all-org')
  async listAllOrgFiles(@GetSessionAuthContext() context: SessionAuthContext) {
    const { isOrgAdmin, userTeamIds } = await this.folders.getMembershipContext(
      context.orgId,
      context.userId,
    );
    return this.files.getAllOrgFiles(context.orgId, userTeamIds, {
      userId: context.userId,
      isOrgAdmin,
    });
  }

  @Get('projects/:projectId/files')
  projectFiles(
    @Param('projectId') projectId: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.files.getProjectFiles(projectId, context.orgId);
  }

  @Post('files/:id/move')
  moveFile(
    @Param('id') id: string,
    @Body() dto: MoveFileDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.files.moveFileToFolder(id, dto.folderId ?? null, context.orgId);
  }

  @Post('files/:id/import-to-project')
  importToProject(
    @Param('id') id: string,
    @Body() dto: ImportFileToProjectDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.files.importFileToProject(
      id,
      dto.targetProjectId,
      context.orgId,
    );
  }

  @Get('files/:id/permissions')
  getFilePermissions(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.permissions.getFilePermissions(id, context.orgId);
  }

  @Post('files/:id/share')
  shareFile(
    @Param('id') id: string,
    @Body() dto: ShareResourceDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.permissions.shareResource({
      resourceType: 'file',
      fileId: id,
      organizationId: context.orgId,
      granteeType: dto.granteeType,
      granteeId: dto.granteeId,
      permission: dto.permission,
      grantedBy: context.userId,
    });
  }

  // --- Folders (permissions only — CRUD lives on FoldersController) --

  @Get('folders/:id/permissions')
  getFolderPermissions(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.permissions.getFolderPermissions(id, context.orgId);
  }

  @Post('folders/:id/share')
  shareFolder(
    @Param('id') id: string,
    @Body() dto: ShareResourceDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.permissions.shareResource({
      resourceType: 'folder',
      folderId: id,
      organizationId: context.orgId,
      granteeType: dto.granteeType,
      granteeId: dto.granteeId,
      permission: dto.permission,
      grantedBy: context.userId,
    });
  }

  // --- Shared permission-grant lifecycle ------------------------------

  @Delete('document-permissions/:permissionId')
  revokeShare(
    @Param('permissionId', ParseIntPipe) permissionId: number,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.permissions.revokeShare(permissionId, context.orgId);
  }

  // --- Markdown documents ---------------------------------------------

  @Post('documents')
  createDocument(
    @Body() dto: CreateDocumentDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.files.createDocument({
      title: dto.title,
      content: dto.content,
      organizationId: context.orgId,
      fileId: dto.fileId,
      projectId: dto.projectId,
    });
  }

  @Get('documents/:id')
  getDocument(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.files.getDocumentById(id, context.orgId);
  }

  @Get('documents/:id/preview')
  getDocumentPreview(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.files.getDocumentPreview({
      orgId: context.orgId,
      documentId: id,
    });
  }

  @Put('documents/:id/title')
  async updateDocumentTitle(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentTitleDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    await this.files.updateDocumentTitle({
      orgId: context.orgId,
      documentId: id,
      title: dto.title,
    });
    return { success: true };
  }

  @Put('documents/:id/content')
  async updateDocumentContent(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentContentDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    await this.files.updateDocumentContent({
      orgId: context.orgId,
      documentId: id,
      content: dto.content,
    });
    return { success: true };
  }
}
