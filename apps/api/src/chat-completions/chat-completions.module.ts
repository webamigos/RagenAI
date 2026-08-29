import { Module } from '@nestjs/common';
import { ChatCompletionsController } from './chat-completions.controller.js';
import { ChatCompletionsService } from './chat-completions.service.js';

@Module({
  controllers: [ChatCompletionsController],
  providers: [ChatCompletionsService],
})
export class ChatCompletionsModule {}
