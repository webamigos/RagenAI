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
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { RenameProjectDto } from './dto/rename-project.dto.js';
import { SaveProjectInstructionDto } from './dto/save-project-instruction.dto.js';
import { SaveProjectMcpProvidersDto } from './dto/save-project-mcp-providers.dto.js';
import { ShareProjectDto } from './dto/share-project.dto.js';
import { ToggleChatbotDto } from './dto/toggle-chatbot.dto.js';
import { GetUserProjectsDto } from './dto/get-user-projects.dto.js';
import { GetSessionAuthContext } from '../common/decorators/session-auth-context.decorator.js';
import { type SessionAuthContext } from '../common/types/session-auth-context.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';

/**
 * Session-authenticated, server-to-server routes — see
 * `NotificationsController`'s class-level comment for the shared
 * conventions (guard, Swagger exclusion, response-transform skip).
 *
 * Not exposed here: `getProjectById`/`getProjectByIdOrThrow` (no access
 * check — use `getProjectDetail`, which gates on
 * `getEffectiveProjectPermission().canView` first, added specifically
 * for this controller) and `getPublicProject` (keyed by a public access
 * token, not `userId`/`orgId` — backs the unauthenticated shared-project
 * page, a different auth surface `SessionAuthGuard` doesn't cover).
 */
@ApiExcludeController()
@Controller('internal/projects')
@UseGuards(SessionAuthGuard)
@SkipResponseTransform()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @Query() query: GetUserProjectsDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.getUserProjects(context.orgId, context.userId, {
      includeArchived: query.includeArchived,
    });
  }

  @Get('default')
  async getDefault(
    @GetSessionAuthContext() context: SessionAuthContext,
  ): Promise<{ projectId: string | null }> {
    // Wrapped in an object rather than returned bare — a raw string
    // return value makes Nest/Express fall back to `res.send()` instead
    // of `res.json()`, sending an unquoted, invalid-JSON body (and an
    // empty body entirely for `null`). See the same note on
    // `getInstruction()` below.
    const projectId = await this.projects.getDefaultProjectId(context.orgId);
    return { projectId };
  }

  @Post()
  create(
    @Body() dto: CreateProjectDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.createProject(
      dto.title,
      context.orgId,
      context.userId,
    );
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.getProjectDetail(id, context.orgId, context.userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.deleteProject(id, context.orgId, context.userId);
  }

  @Put(':id/rename')
  rename(
    @Param('id') id: string,
    @Body() dto: RenameProjectDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.renameProject(
      id,
      dto.title,
      context.orgId,
      context.userId,
    );
  }

  @Post(':id/archive')
  archive(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.archiveProject(
      id,
      true,
      context.orgId,
      context.userId,
    );
  }

  @Post(':id/unarchive')
  unarchive(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.archiveProject(
      id,
      false,
      context.orgId,
      context.userId,
    );
  }

  @Post(':id/star')
  star(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.starProject(id, true, context.orgId, context.userId);
  }

  @Post(':id/unstar')
  unstar(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.starProject(id, false, context.orgId, context.userId);
  }

  @Post(':id/disable-public-access')
  disablePublicAccess(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.disablePublicAccess(id, context.orgId, context.userId);
  }

  @Post(':id/mark-integrations-prompted')
  markIntegrationsPrompted(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.markIntegrationsPrompted(
      id,
      context.orgId,
      context.userId,
    );
  }

  @Get(':id/instruction')
  async getInstruction(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ): Promise<{ instruction: string | null }> {
    // Wrapped in an object rather than returned bare — Nest/Express
    // serializes a raw string return value via `res.send()`, not
    // `res.json()`, producing an unquoted (invalid-JSON) body — and an
    // empty body entirely for `null`, indistinguishable from "no
    // content". Caught by a live end-to-end check against a real
    // running instance, not by unit tests or `nest build`'s type
    // checking (both stayed green throughout — this is a runtime
    // serialization behavior, not a type error).
    const instruction = await this.projects.getProjectInstruction(
      id,
      context.orgId,
    );
    return { instruction };
  }

  @Put(':id/instruction')
  async saveInstruction(
    @Param('id') id: string,
    @Body() dto: SaveProjectInstructionDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    await this.projects.saveProjectInstruction(
      id,
      dto.instruction,
      context.orgId,
      context.userId,
    );
    return { success: true };
  }

  @Get(':id/mcp-providers')
  getMcpProviders(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.getProjectMcpProviders(id, context.orgId);
  }

  @Put(':id/mcp-providers')
  async saveMcpProviders(
    @Param('id') id: string,
    @Body() dto: SaveProjectMcpProvidersDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    await this.projects.saveProjectMcpProviders(
      id,
      dto.providers,
      context.orgId,
      context.userId,
    );
    return { success: true };
  }

  @Get(':id/permissions')
  getPermissions(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.getProjectPermissions(id, context.orgId);
  }

  @Post(':id/share')
  share(
    @Param('id') id: string,
    @Body() dto: ShareProjectDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.shareProject({
      projectId: id,
      organizationId: context.orgId,
      granteeType: dto.granteeType,
      granteeId: dto.granteeId,
      permission: dto.permission,
      grantedBy: context.userId,
    });
  }

  @Delete('permissions/:permissionId')
  revokeShare(
    @Param('permissionId', ParseIntPipe) permissionId: number,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.revokeProjectShare(permissionId, context.orgId);
  }

  @Post(':id/generate-key')
  generateKey(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.generateProjectKey(id, context.orgId, context.userId);
  }

  @Post(':id/toggle-chatbot')
  toggleChatbot(
    @Param('id') id: string,
    @Body() dto: ToggleChatbotDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.projects.toggleChatbot(
      id,
      dto.enabled,
      context.orgId,
      context.userId,
    );
  }
}
