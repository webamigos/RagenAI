import { Module } from '@nestjs/common';
import { ChatCompletionsController } from './chat-completions.controller.js';
import { ChatCompletionsService } from './chat-completions.service.js';
import { RagEngineModule } from '../rag-engine/rag-engine.module.js';
import { ThreadsModule } from '../threads/threads.module.js';

@Module({
  imports: [RagEngineModule, ThreadsModule],
  controllers: [ChatCompletionsController],
  providers: [ChatCompletionsService],
})
export class ChatCompletionsModule {}
