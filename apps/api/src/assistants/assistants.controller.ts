import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AssistantsService } from './assistants.service.js';
import { CreateAssistantDto } from './dto/create-assistant.dto.js';
import { UpdateAssistantDto } from './dto/update-assistant.dto.js';
import { ListAssistantsDto } from './dto/list-assistants.dto.js';
import { GetApiContext } from '../common/decorators/api-context.decorator.js';
import { type ApiContext } from '../common/types/api-context.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';
import { OpenAiExceptionFilter } from '../common/filters/openai-exception.filter.js';

/**
 * OpenAI-compatible Assistants API. Maps 1:1 onto Ragen Projects:
 *   `asst-<projectId>` ↔ `Project.id`
 *   `name`             ↔ `Project.title`
 *   `instructions`     ↔ `ProjectSettings.instructions`
 *   `model`/`temperature` are read-through from org defaults today;
 *   per-assistant overrides require a schema change.
 *
 * Org-scoped (not project-scoped) so `client.assistants.list()` surfaces
 * every assistant the caller's org owns — consistent with OpenAI's
 * behaviour. The API key's project binding still governs chat/files.
 */
@ApiTags('Assistants')
@ApiSecurity('bearer')
@Controller('assistants')
@UseGuards(ApiKeyGuard)
@UseFilters(OpenAiExceptionFilter)
@SkipResponseTransform()
export class AssistantsController {
  constructor(private readonly assistantsService: AssistantsService) {}

  @Get()
  @ApiOperation({ summary: 'List assistants' })
  list(
    @GetApiContext() context: ApiContext,
    @Query() query: ListAssistantsDto,
  ) {
    return this.assistantsService.list(context, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve an assistant' })
  retrieve(@Param('id') id: string, @GetApiContext() context: ApiContext) {
    return this.assistantsService.get(id, context);
  }

  @Post()
  @ApiOperation({ summary: 'Create an assistant' })
  create(
    @Body() dto: CreateAssistantDto,
    @GetApiContext() context: ApiContext,
  ) {
    return this.assistantsService.create(dto, context);
  }

  // OpenAI uses POST /v1/assistants/:id for modify. We accept both
  // POST and PATCH so cURL users with more REST-ish habits also work.
  @Post(':id')
  @ApiOperation({ summary: 'Modify an assistant (OpenAI-compatible)' })
  modifyViaPost(
    @Param('id') id: string,
    @Body() dto: UpdateAssistantDto,
    @GetApiContext() context: ApiContext,
  ) {
    return this.assistantsService.update(id, dto, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modify an assistant (REST-style PATCH)' })
  modifyViaPatch(
    @Param('id') id: string,
    @Body() dto: UpdateAssistantDto,
    @GetApiContext() context: ApiContext,
  ) {
    return this.assistantsService.update(id, dto, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an assistant' })
  remove(@Param('id') id: string, @GetApiContext() context: ApiContext) {
    return this.assistantsService.remove(id, context);
  }
}
