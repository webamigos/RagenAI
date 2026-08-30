import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { KnowledgeAnalyticsService } from './knowledge-analytics.service.js';
import { AnalyticsQueryDto } from './dto/analytics-query.dto.js';
import { GetSessionAuthContext } from '../common/decorators/session-auth-context.decorator.js';
import { type SessionAuthContext } from '../common/types/session-auth-context.js';
import { SessionAuthGuard } from '../common/guards/session-auth.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';

/**
 * Session-authenticated, server-to-server routes — see
 * `NotificationsController`'s class-level comment for the shared
 * conventions (guard, Swagger exclusion, response-transform skip).
 */
@ApiExcludeController()
@Controller('internal/knowledge-analytics')
@UseGuards(SessionAuthGuard)
@SkipResponseTransform()
export class KnowledgeAnalyticsController {
  constructor(private readonly analytics: KnowledgeAnalyticsService) {}

  @Get('summary')
  summary(
    @Query() query: AnalyticsQueryDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.analytics.getSummary(context.orgId, query.days ?? 30);
  }

  @Get('daily-questions')
  dailyQuestions(
    @Query() query: AnalyticsQueryDto,
    @GetSessionAuthContext() context: SessionAuthContext,
  ) {
    return this.analytics.getDailyQuestions(context.orgId, query.days ?? 30);
  }

  @Get('top-cited-documents')
  topCited(@GetSessionAuthContext() context: SessionAuthContext) {
    return this.analytics.getTopCitedDocuments(context.orgId);
  }

  @Get('unused-documents')
  unused(@GetSessionAuthContext() context: SessionAuthContext) {
    return this.analytics.getUnusedDocuments(context.orgId);
  }
}
