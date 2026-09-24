import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { GetApiContext } from '../common/decorators/api-context.decorator.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';
import { type ApiContext } from '../common/types/api-context.js';
import { BrainService } from './brain.service.js';

const PAGE_STATUSES = ['CANDIDATE', 'APPROVED', 'REJECTED', 'STALE'] as const;
const FINDING_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;

/**
 * Ragen Brain, read-only, for the CLI (`ragen brain …`). Every route answers
 * 404 unless the key's user is an owner or admin of an organization with the
 * `brain` flag on — see `BrainService.assertAccess`.
 */
@ApiTags('Brain')
@ApiSecurity('bearer')
@Controller('brain')
@UseGuards(ApiKeyGuard)
@SkipResponseTransform()
export class BrainController {
  constructor(private readonly brain: BrainService) {}

  @Get('next')
  @ApiOperation({ summary: 'The single most useful next step in curation' })
  next(@GetApiContext() context: ApiContext) {
    return this.brain.next(context);
  }

  @Get('health')
  @ApiOperation({
    summary: 'Checks on extraction, ownership, access and publication',
  })
  health(@GetApiContext() context: ApiContext) {
    return this.brain.health(context);
  }

  @Get('findings')
  @ApiOperation({ summary: 'Findings, most severe first' })
  findings(
    @GetApiContext() context: ApiContext,
    @Query('status') status?: string,
  ) {
    const s = (FINDING_STATUSES as readonly string[]).includes(status ?? '')
      ? (status as (typeof FINDING_STATUSES)[number])
      : 'OPEN';
    return this.brain.findings(context, s);
  }

  @Get('pages')
  @ApiOperation({
    summary: 'Knowledge pages, optionally searched and filtered by status',
  })
  pages(
    @GetApiContext() context: ApiContext,
    @Query('q') q?: string,
    @Query('status') status?: string,
  ) {
    return this.brain.pages(context, {
      q: q?.trim() ? q.trim().slice(0, 200) : undefined,
      status: (PAGE_STATUSES as readonly string[]).includes(status ?? '')
        ? (status as (typeof PAGE_STATUSES)[number])
        : undefined,
    });
  }

  @Get('graph')
  @ApiOperation({
    summary: 'The pages as a graph: an overview or one page’s neighbourhood',
  })
  graph(
    @GetApiContext() context: ApiContext,
    @Query('focus') focus?: string,
    @Query('hops') hops?: string,
    @Query('budget') budget?: string,
    @Query('inferred') inferred?: string,
  ) {
    return this.brain.graph(context, { focus, hops, budget, inferred });
  }

  @Get('export')
  @ApiOperation({
    summary:
      'The curated bundle as files (markdown, graph.json, manifest.json)',
  })
  exportBundle(@GetApiContext() context: ApiContext) {
    return this.brain.exportBundle(context);
  }
}
