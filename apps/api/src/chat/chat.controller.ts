import { Controller, Post, Body, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { type Request, type Response } from 'express';
import { ChatService } from './chat.service.js';
import { GetApiContext } from '../common/decorators/api-context.decorator.js';
import { type ApiContext } from '../common/types/api-context.js';
import { ApiKeyGuard } from '../common/guards/api-key.guard.js';
import { ChatDto } from './dto/chat.dto.js';

@ApiTags('Chat')
@ApiSecurity('bearer')
@Controller('chat')
@UseGuards(ApiKeyGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @ApiOperation({
    summary: 'Send a chat message',
    description:
      'Send a message and receive an AI-generated response grounded in the project knowledge base. ' +
      'Supports both JSON and streaming (SSE) responses.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Successful response. Returns JSON `{ "text": "..." }` when `stream` is false, ' +
      'or a `text/event-stream` when `stream` is true.',
  })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 403, description: 'API key is deactivated' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 502, description: 'Upstream service unavailable' })
  async chat(
    @Body() dto: ChatDto,
    @GetApiContext() context: ApiContext,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.chatService.chat(dto, context, req, res);
  }
}
