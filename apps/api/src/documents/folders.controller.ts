import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { FoldersService } from './folders.service.js';
import { CreateFolderDto } from './dto/create-folder.dto.js';
import { UpdateFolderDto } from './dto/update-folder.dto.js';
import { MoveFolderDto } from './dto/move-folder.dto.js';
import { UpdateFolderPiiPolicyDto } from './dto/update-folder-pii-policy.dto.js';
import { GetSessionAuthContext } from '../common/decorators/session-auth-context.decorator.js';
import { type SessionAuthContext } from '../common/types/session-auth-context.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';

/**
 * Session-authenticated, server-to-server routes — see
 * `NotificationsController`'s class-level comment for the shared
 * conventions (guard, Swagger exclusion, response-transform skip).
 *
 * `getFolders` needs `isOrgAdmin`/`userTeamIds`, which `SessionAuthContext`
 * doesn't carry — resolved per-request via the new
 * `FoldersService.getMembershipContext()` (added for this controller).
 */
@ApiExcludeController()
@Controller('internal/folders')
@UseGuards(SessionAuthGuard)
@SkipResponseTransform()
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  async list(@GetSessionAuthContext() context: SessionAuthContext) {
    const { isOrgAdmin, userTeamIds } = await this.folders.getMembershipContext(
      context.orgId,
      context.userId,
    );
    return this.folders.getFolders(
      context.orgId,
      userTeamIds,
      context.userId,
      isOrgAdmin,
    );
  }

  @Post()
  create(
    @Body() dto: CreateFolderDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.folders.createFolder({
      name: dto.name,
      organizationId: context.orgId,
      teamId: dto.teamId,
      parentId: dto.parentId,
      ownerId: context.userId,
      piiPolicy: dto.piiPolicy,
    });
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFolderDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.folders.updateFolder(id, context.orgId, dto);
  }

  @Post(':id/move')
  move(
    @Param('id') id: string,
    @Body() dto: MoveFolderDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.folders.moveFolder(id, dto.newParentId ?? null, context.orgId);
  }

  @Get(':id/breadcrumbs')
  breadcrumbs(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.folders.getFolderBreadcrumbs(id, context.orgId);
  }

  @Get(':id/pii-policy')
  async getPiiPolicy(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ): Promise<{ piiPolicy: string }> {
    // Wrapped in an object — a bare enum-as-string return value makes
    // Nest/Express fall back to `res.send()` instead of `res.json()`,
    // sending an unquoted (invalid-JSON) body. See ProjectsController's
    // getInstruction()/getDefault() for the same fix + fuller note.
    const piiPolicy = await this.folders.getFolderPiiPolicy(id, context.orgId);
    return { piiPolicy };
  }

  @Put(':id/pii-policy')
  async setPiiPolicy(
    @Param('id') id: string,
    @Body() dto: UpdateFolderPiiPolicyDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    await this.folders.updateFolderPiiPolicy(id, context.orgId, dto.piiPolicy);
    return { success: true };
  }
}
