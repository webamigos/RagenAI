import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service.js';
import { GetNotificationsDto } from './dto/get-notifications.dto.js';
import { GetSessionAuthContext } from '../common/decorators/session-auth-context.decorator.js';
import { type SessionAuthContext } from '../common/types/session-auth-context.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';

/**
 * Session-authenticated, server-to-server routes callable only by
 * apps/web on behalf of an already-signed-in user (see
 * `SessionAuthGuard`, Phase A of docs/adrs/21-monorepo-and-api-decoupling.md).
 * Not part of the public OpenAI-compatible API — excluded from Swagger.
 *
 * Response shapes are returned verbatim from `NotificationsService`
 * (`publicId`, not `id` — matches apps/web's own
 * `getNotificationsAction()` contract exactly, since the eventual UI
 * cutover swaps that Server Action call for this endpoint with no
 * client-side shape change needed). `@SkipResponseTransform()` — same
 * as every other controller in this codebase — `ReplaceIdsInterceptor`
 * expects snake_case keys Prisma never actually produces.
 */
@ApiExcludeController()
@Controller('internal/notifications')
@UseGuards(SessionAuthGuard)
@SkipResponseTransform()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @GetSessionAuthContext() context: SessionAuthContext,
    @Query() query: GetNotificationsDto,
  ) {
    return this.notifications.getNotifications({
      userId: context.userId,
      organizationId: context.orgId,
      ...query,
    });
  }

  @Post('read-all')
  async markAllRead(@GetSessionAuthContext() context: SessionAuthContext) {
    await this.notifications.markAllAsRead({
      userId: context.userId,
      organizationId: context.orgId,
    });
    return { success: true };
  }

  @Post(':publicId/read')
  async markRead(
    @Param('publicId') publicId: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    await this.notifications.markAsRead({
      publicId,
      userId: context.userId,
      organizationId: context.orgId,
    });
    return { success: true };
  }
}
