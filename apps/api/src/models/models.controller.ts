import { Controller, Get, Param, UseFilters, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ModelsService } from './models.service.js';
import { GetApiContext } from '../common/decorators/api-context.decorator.js';
import { type ApiContext } from '../common/types/api-context.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';
import { OpenAiExceptionFilter } from '../common/filters/openai-exception.filter.js';
import { buildList } from '../common/utils/openai-format.js';

/**
 * OpenAI-compatible Models API — what an SDK's `client.models.list()` calls,
 * and what an OpenAI-compatible client fills its model picker from.
 *
 * Read-only by design: the set comes from the catalogue, the route table and
 * the organization's allowlist, none of which an API caller configures.
 */
@ApiTags('Models')
@ApiSecurity('bearer')
@Controller('models')
@UseGuards(ApiKeyGuard)
@UseFilters(OpenAiExceptionFilter)
@SkipResponseTransform()
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  @ApiOperation({ summary: 'List the models available to this organization' })
  async list(@GetApiContext() context: ApiContext) {
    return buildList(await this.modelsService.list(context));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve one model' })
  get(@Param('id') id: string, @GetApiContext() context: ApiContext) {
    return this.modelsService.get(id, context);
  }
}
