import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ThreadsCoreService } from './thread-core.service.js';
import { ThreadSharingService } from './thread-sharing.service.js';
import { GetThreadsDto } from './dto/internal/get-threads.dto.js';
import { GetSidebarThreadsDto } from './dto/internal/get-sidebar-threads.dto.js';
import { SearchThreadsDto } from './dto/internal/search-threads.dto.js';
import { CreateThreadRequestDto } from './dto/internal/create-thread.dto.js';
import { RenameThreadDto } from './dto/internal/rename-thread.dto.js';
import { UpdateThreadContextDto } from './dto/internal/update-thread-context.dto.js';
import { SendMessageDto } from './dto/internal/send-message.dto.js';
import { ShareThreadDto } from './dto/internal/share-thread.dto.js';
import { CreatePublicLinkDto } from './dto/internal/create-public-link.dto.js';
import { GetThreadDetailsDto } from './dto/internal/get-thread-details.dto.js';
import { GetSessionAuthContext } from '../common/decorators/session-auth-context.decorator.js';
import { type SessionAuthContext } from '../common/types/session-auth-context.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';

/**
 * Session-authenticated, server-to-server routes for the panel-UI thread
 * feature (`ThreadsCoreService`/`ThreadSharingService`) — see
 * `NotificationsController`'s class-level comment for the shared
 * conventions (guard, Swagger exclusion, response-transform skip).
 *
 * Deliberately separate from the pre-existing `ThreadsController`
 * (`@Controller('threads')`, `/v1/threads`) in this same directory, which
 * backs the OpenAI-compatible public API and is untouched by this file —
 * different route prefix (`internal/threads`), different service, no
 * overlap.
 *
 * Callers use their own `userId` as the `visitorId` ragen-app's ported
 * queries expect — matches the original's own convention for
 * authenticated (non-guest) users (see `createThread`: `visitorId: userId
 * ? userId : visitorId`).
 *
 * Not exposed here:
 * - `getProjectByIdOrThrow`-style raw reads with no access check are not
 *   present in this pair of services — every query already scopes by
 *   `organizationId` and/or an exact `userId`/`visitorId` match. The two
 *   exceptions (`createThreadAction`'s unchecked `projectId`/
 *   `mentionedProjectId`, and `sendMessage`'s org-unaware
 *   `findOrCreateThread` call) are covered by two new gated wrappers
 *   added to `ThreadsCoreService` for this controller:
 *   `createThreadForUser` and `sendMessageInOwnThread` — see their doc
 *   comments.
 * - `ThreadEncryptionService`'s `encryptThreads`/`encryptAllThreads` —
 *   app-admin-only batch KMS migration in ragen-app's original design.
 *   `SessionAuthContext` carries no app-admin-role flag right now (just
 *   `{userId, orgId, projectId?}`), so there's no way to verify "is this
 *   user an app admin" without porting that check first — out of scope
 *   here.
 * - `ThreadSharingService.getPublicThread` — keyed by a public link
 *   token (+ optional password), not `userId`/`orgId` — backs the
 *   unauthenticated shared-thread page, a different auth surface
 *   `SessionAuthGuard` doesn't cover (same exclusion pattern as
 *   `ProjectsController`'s `getPublicProject` exclusion).
 * - `removeThreadProjectContext`/`updateThreadProjectContext` (the raw,
 *   unscoped private-ish helpers) — only their org-gated wrappers
 *   (`removeThreadContext`/`updateThreadContext`) are exposed.
 * - `findOrCreateThread`/`createGuestThread`/`createThread` — internal
 *   building blocks for the guest/embed-widget flow (keyed by
 *   `visitorId`, no `userId`/`orgId` concept), a different, unaddressed
 *   auth surface, same reasoning as `MessagesController`'s
 *   `getThreadMessages` exclusion.
 */
@ApiExcludeController()
@Controller('internal/threads')
@UseGuards(SessionAuthGuard)
@SkipResponseTransform()
export class ThreadCoreController {
  constructor(
    private readonly threads: ThreadsCoreService,
    private readonly sharing: ThreadSharingService,
  ) {}

  @Get('sidebar')
  getSidebar(
    @Query() query: GetSidebarThreadsDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.getSidebarThreads(
      context.userId,
      context.orgId,
      query.recentLimit,
      query.recentSkip,
    );
  }

  @Get('shared')
  getShared(@GetSessionAuthContext() context: SessionAuthContext) {
    return this.threads.getSharedThreads(context.userId, context.orgId);
  }

  @Get('mine')
  getMine(
    @Query() query: GetThreadsDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.getUserThreads(
      context.userId,
      context.orgId,
      query.skip,
      query.take,
      query.query,
    );
  }

  @Get('search-all')
  searchAll(
    @Query() query: SearchThreadsDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.searchAll(context.userId, context.orgId, query.query);
  }

  @Get('search')
  search(
    @Query() query: SearchThreadsDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.searchThreads(
      context.userId,
      context.orgId,
      query.query,
    );
  }

  @Get('public-links')
  getPublicLinks(@GetSessionAuthContext() context: SessionAuthContext) {
    return this.sharing.getUserPublicLinks(context.userId);
  }

  @Get()
  list(
    @Query() query: GetThreadsDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.getAllThreads(
      context.userId,
      context.orgId,
      query.skip,
      query.take,
      query.query,
    );
  }

  @Post()
  create(
    @Body() dto: CreateThreadRequestDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.createThreadForUser(context.orgId, context.userId, {
      projectId: dto.projectId,
      mentionedProjectId: dto.mentionedProjectId,
      preferredModel: dto.preferredModel,
      threadDocuments: dto.threadDocuments as never,
    });
  }

  @Get(':id')
  get(
    @Param('id') id: string,
    @Query() query: GetThreadDetailsDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.getThreadDetails(id, context.orgId, {
      includeMessages: query.includeMessages,
    });
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.deleteThread(id, context.orgId);
  }

  @Put(':id/rename')
  rename(
    @Param('id') id: string,
    @Body() dto: RenameThreadDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.renameThread(id, dto.title, context.orgId);
  }

  @Post(':id/star')
  star(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.toggleThreadStarred(id, true, context.orgId);
  }

  @Post(':id/unstar')
  unstar(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.toggleThreadStarred(id, false, context.orgId);
  }

  @Delete(':id/context')
  removeContext(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.removeThreadContext(id, context.orgId);
  }

  @Put(':id/context')
  updateContext(
    @Param('id') id: string,
    @Body() dto: UpdateThreadContextDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.updateThreadContext(
      id,
      dto.mentionedProjectId ?? null,
      context.orgId,
    );
  }

  @Get(':id/messages')
  getMessages(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.getThreadMessagesList(id, context.orgId);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.threads.sendMessageInOwnThread(
      id,
      context.orgId,
      context.userId,
      dto as never,
    );
  }

  @Get(':id/shares')
  getShares(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.sharing.getThreadShares(id, context.orgId, context.userId);
  }

  @Post(':id/share')
  share(
    @Param('id') id: string,
    @Body() dto: ShareThreadDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.sharing.shareThread({
      threadId: id,
      recipientUserIds: dto.recipientUserIds,
      organizationId: context.orgId,
      currentUserId: context.userId,
    });
  }

  @Get(':id/public-link')
  getPublicLink(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.sharing.getPublicLink(id, context.userId);
  }

  @Post(':id/public-link')
  createPublicLink(
    @Param('id') id: string,
    @Body() dto: CreatePublicLinkDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.sharing.createPublicLink({
      threadId: id,
      organizationId: context.orgId,
      currentUserId: context.userId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      password: dto.password,
    });
  }

  @Delete(':id/public-link')
  revokePublicLink(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.sharing.revokePublicLink({
      threadId: id,
      currentUserId: context.userId,
      organizationId: context.orgId,
    });
  }
}
