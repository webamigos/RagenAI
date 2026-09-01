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
import { ThreadsService } from './threads.service.js';
import { MessagesService } from './messages.service.js';
import { CreateThreadDto } from './dto/create-thread.dto.js';
import { UpdateThreadDto } from './dto/update-thread.dto.js';
import { ListThreadsDto } from './dto/list-threads.dto.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { ListMessagesDto } from './dto/list-messages.dto.js';
import { GetApiContext } from '../common/decorators/api-context.decorator.js';
import { type ApiContext } from '../common/types/api-context.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';
import { OpenAiExceptionFilter } from '../common/filters/openai-exception.filter.js';

/**
 * OpenAI-compatible Threads + Messages API.
 *
 * Scope notes:
 *  - Threads are org-scoped (same reasoning as assistants — the key's
 *    project is a default, not a visibility boundary).
 *  - Message `create` persists the turn but does NOT run the model —
 *    OpenAI's Assistants API separates persistence from execution
 *    (via `runs`). For AI generation, use `/v1/chat/completions`.
 *  - Reading messages on a KMS-encrypted thread returns a placeholder
 *    content string; ragen-api can't decrypt. Use the dashboard for
 *    encrypted threads.
 */
@ApiTags('Threads')
@ApiSecurity('bearer')
@Controller('threads')
@UseGuards(ApiKeyGuard)
@UseFilters(OpenAiExceptionFilter)
@SkipResponseTransform()
export class ThreadsController {
  constructor(
    private readonly threadsService: ThreadsService,
    private readonly messagesService: MessagesService,
  ) {}

  // ── Threads ────────────────────────────────────────────────────────
  @Get()
  @ApiOperation({
    summary: 'List threads',
    description:
      'Ragen extension (not in the OpenAI spec) — returns threads in the caller org.',
  })
  listThreads(
    @GetApiContext() context: ApiContext,
    @Query() query: ListThreadsDto,
  ) {
    return this.threadsService.list(context, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a thread' })
  createThread(
    @Body() dto: CreateThreadDto,
    @GetApiContext() context: ApiContext,
  ) {
    return this.threadsService.create(dto, context);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve a thread' })
  retrieveThread(
    @Param('id') id: string,
    @GetApiContext() context: ApiContext,
  ) {
    return this.threadsService.get(id, context);
  }

  @Post(':id')
  @ApiOperation({ summary: 'Modify a thread (OpenAI convention)' })
  modifyThreadPost(
    @Param('id') id: string,
    @Body() dto: UpdateThreadDto,
    @GetApiContext() context: ApiContext,
  ) {
    return this.threadsService.update(id, dto, context);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modify a thread (REST alias)' })
  modifyThreadPatch(
    @Param('id') id: string,
    @Body() dto: UpdateThreadDto,
    @GetApiContext() context: ApiContext,
  ) {
    return this.threadsService.update(id, dto, context);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a thread + all its messages' })
  deleteThread(@Param('id') id: string, @GetApiContext() context: ApiContext) {
    return this.threadsService.remove(id, context);
  }

  // ── Messages ───────────────────────────────────────────────────────
  @Get(':id/messages')
  @ApiOperation({ summary: 'List messages on a thread' })
  listMessages(
    @Param('id') threadId: string,
    @GetApiContext() context: ApiContext,
    @Query() query: ListMessagesDto,
  ) {
    return this.messagesService.list(threadId, context, query);
  }

  @Post(':id/messages')
  @ApiOperation({
    summary: 'Add a message to a thread',
    description:
      'Persists a user or assistant message. Does NOT run the model — ' +
      'use POST /v1/chat/completions for AI generation.',
  })
  createMessage(
    @Param('id') threadId: string,
    @Body() dto: CreateMessageDto,
    @GetApiContext() context: ApiContext,
  ) {
    return this.messagesService.create(threadId, dto, context);
  }

  @Get(':id/messages/:messageId')
  @ApiOperation({ summary: 'Retrieve a message' })
  retrieveMessage(
    @Param('id') threadId: string,
    @Param('messageId') messageId: string,
    @GetApiContext() context: ApiContext,
  ) {
    return this.messagesService.get(threadId, messageId, context);
  }

  @Delete(':id/messages/:messageId')
  @ApiOperation({ summary: 'Delete a message' })
  deleteMessage(
    @Param('id') threadId: string,
    @Param('messageId') messageId: string,
    @GetApiContext() context: ApiContext,
  ) {
    return this.messagesService.remove(threadId, messageId, context);
  }
}
