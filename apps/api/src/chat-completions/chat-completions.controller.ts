import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { ChatCompletionsService } from './chat-completions.service.js';
import { CreateChatCompletionDto } from './dto/create-chat-completion.dto.js';
import { GetApiContext } from '../common/decorators/api-context.decorator.js';
import { type ApiContext } from '../common/types/api-context.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';
import { SkipResponseTransform } from '../common/decorators/skip-response-transform.decorator.js';
import { OpenAiExceptionFilter } from '../common/filters/openai-exception.filter.js';

/**
 * OpenAI-compatible `POST /v1/chat/completions` — the primary entry
 * point for the OpenAI Python/JS SDK. Behind the scenes this delegates
 * the actual RAG chain execution to ragen-app's internal
 * `/api/v1/chat/completions` endpoint, then translates the ragen-
 * native JSON / SSE format into OpenAI wire format.
 */
@ApiTags('Chat Completions')
@ApiSecurity('bearer')
// Each chat completion runs a full RAG pipeline (vector search +
// rerank + LLM call), so cap it at the `expensive` tier to protect
// upstream budgets from accidental tight loops.
@Controller('chat/completions')
@UseGuards(ApiKeyGuard)
@UseFilters(OpenAiExceptionFilter)
@SkipResponseTransform()
@Throttle({ expensive: { limit: 10, ttl: 60_000 } })
export class ChatCompletionsController {
  constructor(private readonly service: ChatCompletionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a chat completion',
    description:
      'OpenAI-compatible chat completion endpoint. Returns a ' +
      '`chat.completion` object when `stream` is false, or a ' +
      '`text/event-stream` of `chat.completion.chunk` objects terminated ' +
      'by `data: [DONE]` when `stream` is true.',
  })
  @ApiResponse({ status: 200, description: 'Successful completion.' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 502, description: 'Upstream service unavailable' })
  async create(
    @Body() dto: CreateChatCompletionDto,
    @GetApiContext() context: ApiContext,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.service.create(dto, context, req, res);
  }
}
