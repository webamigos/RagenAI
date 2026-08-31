import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { MessagesService } from './messages.service.js';
import { RateMessageDto } from './dto/rate-message.dto.js';
import { GetNegativeQaDto } from './dto/get-negative-qa.dto.js';
import { GetSessionAuthContext } from '../common/decorators/session-auth-context.decorator.js';
import { type SessionAuthContext } from '../common/types/session-auth-context.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';

/**
 * Session-authenticated, server-to-server routes — see
 * `NotificationsController`'s class-level comment for the shared
 * conventions (guard, Swagger exclusion, response-transform skip).
 *
 * Not exposed here: `createMessageInDb`/`createAndStoreMessage`
 * (internal building blocks — sending a message is a thread-scoped
 * action, exposed via `ThreadsController`'s `sendMessage` route once
 * that controller lands) and `getThreadMessages` (keyed by `visitorId`,
 * not an authenticated `userId`/`orgId` — backs the anonymous public
 * embed widget, a different auth surface `SessionAuthGuard` doesn't
 * cover; out of scope here).
 */
@ApiExcludeController()
@Controller('internal')
@UseGuards(SessionAuthGuard)
@SkipResponseTransform()
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post('messages/:id/rate')
  rate(
    @Param('id') id: string,
    @Body() dto: RateMessageDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.messages.rateMessage(id, dto.feedback, context.orgId);
  }

  @Delete('messages/:id')
  remove(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.messages.deleteMessage(id, context.orgId);
  }

  @Post('messages/:id/played')
  markPlayed(
    @Param('id') id: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.messages.updateMessagePlayed(id, context.orgId);
  }

  @Post('threads/:threadId/regenerate-last-message')
  regenerate(
    @Param('threadId') threadId: string,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.messages.regenerateAssistantMessage(
      threadId,
      context.orgId,
      context.userId,
    );
  }

  @Get('messages/negative-qa')
  negativeQa(
    @Query() query: GetNegativeQaDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.messages.getNegativeQa(
      context.orgId,
      query.days ?? 30,
      query.page,
    );
  }
}
