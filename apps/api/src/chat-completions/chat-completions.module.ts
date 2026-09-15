import { Module } from '@nestjs/common';
import { ChatCompletionsController } from './chat-completions.controller.js';
import { ChatCompletionsService } from './chat-completions.service.js';
import { RagEngineModule } from '../rag-engine/rag-engine.module.js';
import { TeamLimitsModule } from '../team-limits/team-limits.module.js';
import { ThreadsModule } from '../threads/threads.module.js';

@Module({
  imports: [RagEngineModule, TeamLimitsModule, ThreadsModule],
  controllers: [ChatCompletionsController],
  providers: [ChatCompletionsService],
})
export class ChatCompletionsModule {}
